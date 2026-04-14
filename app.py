from flask import Flask, render_template, request, redirect, url_for, session, flash, g, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from functools import wraps
from sqlalchemy import or_, and_, func
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.neighbors import NearestNeighbors
import re

app = Flask(__name__, static_folder='templates/static', static_url_path='/static')
app.config['SECRET_KEY'] = 'change-this-secret-key'  # TODO: override via env var in production
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///networking.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# Institutional email domains for student verification (for production use)
INSTITUTION_DOMAINS = ['techdept.edu', 'students.techdept.edu']


# -------------------- Models -------------------- #

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)

    # Auth fields
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=True)  # nullable for Google-only
    is_google_account = db.Column(db.Boolean, default=False)

    # Admin + suspension
    is_admin = db.Column(db.Boolean, default=False)
    is_suspended = db.Column(db.Boolean, default=False)

    # Role & verification
    role = db.Column(db.String(20), nullable=False)  # 'student' or 'alumni'
    is_student_verified = db.Column(db.Boolean, default=False)
    is_alumni_approved = db.Column(db.Boolean, default=False)

    # Profile fields
    name = db.Column(db.String(120), nullable=False)
    email_display = db.Column(db.String(255), nullable=True)
    skills = db.Column(db.String(255), nullable=False)  # comma-separated
    career_interests = db.Column(db.String(255), nullable=True)
    industry = db.Column(db.String(255), nullable=True)

    years_experience = db.Column(db.Integer, nullable=True)
    current_company = db.Column(db.String(255), nullable=True)
    education = db.Column(db.String(255), nullable=True)
    bio = db.Column(db.Text, nullable=True)
    location_city = db.Column(db.String(120), nullable=True)
    location_state = db.Column(db.String(120), nullable=True)
    location_country = db.Column(db.String(120), nullable=True)
    mentoring_preference = db.Column(db.String(50), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        if not self.password_hash:
            return False
        return check_password_hash(self.password_hash, password)

    @property
    def is_active(self):
        """Whether the user is allowed to log in and use the platform."""
        if self.is_suspended:
            return False
        if self.role == 'student':
            return self.is_student_verified
        if self.role == 'alumni':
            return self.is_alumni_approved
        return False


class Connection(db.Model):
    __tablename__ = 'connections'

    id = db.Column(db.Integer, primary_key=True)
    requester_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    status = db.Column(db.String(20), nullable=False, default='pending')
    # 'pending', 'accepted', 'declined'

    is_mentorship = db.Column(db.Boolean, default=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    requester = db.relationship('User', foreign_keys=[requester_id])
    receiver = db.relationship('User', foreign_keys=[receiver_id])

    __table_args__ = (
        db.UniqueConstraint('requester_id', 'receiver_id', name='uq_connection_pair'),
    )


class Block(db.Model):
    __tablename__ = 'blocks'

    id = db.Column(db.Integer, primary_key=True)
    blocker_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    blocked_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    blocker = db.relationship('User', foreign_keys=[blocker_id])
    blocked = db.relationship('User', foreign_keys=[blocked_id])

    __table_args__ = (
        db.UniqueConstraint('blocker_id', 'blocked_id', name='uq_block_pair'),
    )


class Message(db.Model):
    __tablename__ = 'messages'

    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_read = db.Column(db.Boolean, default=False)

    sender = db.relationship('User', foreign_keys=[sender_id])
    receiver = db.relationship('User', foreign_keys=[receiver_id])


# -------------------- Helpers -------------------- #

def login_required(view_func):
    @wraps(view_func)
    def wrapped_view(*args, **kwargs):
        if 'user_id' not in session:
            flash('Please log in to access this page.', 'warning')
            return redirect(url_for('login', next=request.path))
        return view_func(*args, **kwargs)
    return wrapped_view


def admin_required(view_func):
    @wraps(view_func)
    def wrapped_view(*args, **kwargs):
        if 'user_id' not in session:
            flash("Admin login required.", "warning")
            return redirect(url_for('login', next=request.path))
        if not getattr(g.user, "is_admin", False):
            flash("You do not have permission to access this page.", "danger")
            return redirect(url_for('dashboard'))
        return view_func(*args, **kwargs)
    return wrapped_view


@app.before_request
def load_logged_in_user():
    user_id = session.get('user_id')
    if user_id is None:
        g.user = None
    else:
        g.user = User.query.get(user_id)


def validate_email(email: str) -> bool:
    pattern = r'^[^@]+@[^@]+\.[^@]+$'
    return re.match(pattern, email) is not None


def is_institution_email(email: str) -> bool:
    domain = email.split('@')[-1].lower()
    return domain in INSTITUTION_DOMAINS


# Connection / Block helpers

def get_connection_between(user1: User, user2: User):
    if not user1 or not user2:
        return None
    return Connection.query.filter(
        or_(
            and_(Connection.requester_id == user1.id, Connection.receiver_id == user2.id),
            and_(Connection.requester_id == user2.id, Connection.receiver_id == user1.id),
        )
    ).first()


def are_connected(user1: User, user2: User) -> bool:
    conn = get_connection_between(user1, user2)
    return conn is not None and conn.status == 'accepted'


def is_blocked_between(user1: User, user2: User) -> bool:
    if not user1 or not user2:
        return False
    block = Block.query.filter(
        or_(
            and_(Block.blocker_id == user1.id, Block.blocked_id == user2.id),
            and_(Block.blocker_id == user2.id, Block.blocked_id == user1.id),
        )
    ).first()
    return block is not None


def remove_connections_between(user1: User, user2: User):
    Connection.query.filter(
        or_(
            and_(Connection.requester_id == user1.id, Connection.receiver_id == user2.id),
            and_(Connection.requester_id == user2.id, Connection.receiver_id == user1.id),
        )
    ).delete(synchronize_session=False)
    db.session.commit()


# -------------------- Matching & ML -------------------- #

def build_feature_string_from_fields(skills: str = "",
                                     career_interests: str = "",
                                     state: str = "",
                                     country: str = "") -> str:
    parts = []
    if skills:
        parts.append((skills.lower() + " ") * 2)  # lightly weight skills
    if career_interests:
        parts.append(career_interests.lower())
    if state:
        parts.append(f"state_{state.lower()}")
    if country:
        parts.append(f"country_{country.lower()}")
    return " ".join(parts)


def build_feature_string_for_user(user: User) -> str:
    return build_feature_string_from_fields(
        skills=user.skills or "",
        career_interests=user.career_interests or "",
        state=user.location_state or "",
        country=user.location_country or "",
    )


def get_matches_for_user(target_user: User,
                         k: int = 5,
                         restrict_to_role: str | None = None):
    if target_user is None:
        return []

    query = User.query.filter(User.id != target_user.id)

    if restrict_to_role:
        query = query.filter_by(role=restrict_to_role)

    candidates = [u for u in query.all() if u.is_active]

    if not candidates:
        return []

    docs = []
    candidate_users = []

    for u in candidates:
        docs.append(build_feature_string_for_user(u))
        candidate_users.append(u)

    target_doc = build_feature_string_for_user(target_user)
    docs.append(target_doc)

    vectorizer = TfidfVectorizer()
    X = vectorizer.fit_transform(docs)

    X_candidates = X[:-1]
    X_target = X[-1]

    knn = NearestNeighbors(metric="cosine")
    knn.fit(X_candidates)

    n_neighbors = min(k, len(candidate_users))
    distances, indices = knn.kneighbors(X_target, n_neighbors=n_neighbors)

    matches = []
    for dist, idx in zip(distances[0], indices[0]):
        candidate = candidate_users[int(idx)]
        similarity = 1.0 - float(dist)
        matches.append((candidate, similarity))

    return matches


# -------------------- Routes: Core & Auth -------------------- #

@app.route('/')
def index():
    return render_template('dashboard.html')


@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        confirm_password = request.form.get('confirm_password', '')
        role = request.form.get('role', '').strip().lower()
        skills = request.form.get('skills', '').strip()
        career_interests = request.form.get('career_interests', '').strip() or None
        industry = request.form.get('industry', '').strip() or None

        years_experience = request.form.get('years_experience') or None
        current_company = request.form.get('current_company', '').strip() or None
        education = request.form.get('education', '').strip() or None
        bio = request.form.get('bio', '').strip() or None
        location_city = request.form.get('location_city', '').strip() or None
        location_state = request.form.get('location_state', '').strip() or None
        location_country = request.form.get('location_country', '').strip() or None
        mentoring_preference = request.form.get('mentoring_preference', '').strip() or None

        errors = []

        if not name:
            errors.append('Name is required.')
        if not email:
            errors.append('Email is required.')
        elif not validate_email(email):
            errors.append('Invalid email format.')
        if not password:
            errors.append('Password is required.')
        elif len(password) < 8:
            errors.append('Password must be at least 8 characters long.')
        if password != confirm_password:
            errors.append('Passwords do not match.')
        if role not in ['student', 'alumni']:
            errors.append('Role must be student or alumni.')
        if not skills:
            errors.append('Skills are required.')

        if User.query.filter_by(email=email).first():
            errors.append('An account with this email already exists.')

        if errors:
            for e in errors:
                flash(e, 'danger')
            return render_template('signup.html')

        # Check if this is the first user in the system
        is_first_user = (User.query.count() == 0)

        user = User(
            name=name,
            email=email,
            role=role,
            skills=skills,
            career_interests=career_interests,
            industry=industry,
            years_experience=int(years_experience) if years_experience is not None and years_experience != "" else None,
            current_company=current_company,
            education=education,
            bio=bio,
            location_city=location_city,
            location_state=location_state,
            location_country=location_country,
            mentoring_preference=mentoring_preference,
        )
        user.set_password(password)
        user.is_google_account = False

        if role == 'student':
            # DEV MODE: auto-verify all students so you can log in easily
            user.is_student_verified = True
            flash('Student account auto-verified (dev mode).', 'success')
        elif role == 'alumni':
            if is_first_user:
                # First alumni becomes admin & is auto-approved
                user.is_alumni_approved = True
                user.is_admin = True
                flash('First alumni user auto-approved as admin.', 'success')
            else:
                user.is_alumni_approved = False
                flash('Alumni account created. An admin must approve your account before you can log in.', 'info')

        db.session.add(user)
        db.session.commit()

        return redirect(url_for('login'))

    return render_template('signup.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')

        user = User.query.filter_by(email=email).first()

        if user is None or not user.check_password(password):
            flash('Invalid email or password.', 'danger')
            return render_template('login.html')

        if not user.is_active:
            if user.is_suspended:
                flash('Your account is suspended.', 'danger')
            elif user.role == 'student':
                flash('Your student account is not yet verified.', 'warning')
            elif user.role == 'alumni':
                flash('Your alumni account is pending admin approval.', 'warning')
            else:
                flash('Your account is not active.', 'warning')
            return render_template('login.html')

        session.clear()
        session['user_id'] = user.id
        flash('Logged in successfully.', 'success')
        next_url = request.args.get('next') or url_for('dashboard')
        return redirect(next_url)

    return render_template('login.html')


@app.route('/logout')
def logout():
    session.clear()
    flash('You have been logged out.', 'info')
    return redirect(url_for('index'))


@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')


@app.route('/profile')
@login_required
def profile():
    return render_template('profile.html', user=g.user)


@app.route('/profile/edit', methods=['GET', 'POST'])
@login_required
def edit_profile():
    user = g.user
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        skills = request.form.get('skills', '').strip()
        career_interests = request.form.get('career_interests', '').strip() or None
        industry = request.form.get('industry', '').strip() or None

        years_experience = request.form.get('years_experience') or None
        current_company = request.form.get('current_company', '').strip() or None
        education = request.form.get('education', '').strip() or None
        bio = request.form.get('bio', '').strip() or None
        location_city = request.form.get('location_city', '').strip() or None
        location_state = request.form.get('location_state', '').strip() or None
        location_country = request.form.get('location_country', '').strip() or None
        mentoring_preference = request.form.get('mentoring_preference', '').strip() or None

        errors = []
        if not name:
            errors.append('Name is required.')
        if not skills:
            errors.append('Skills are required.')

        if errors:
            for e in errors:
                flash(e, 'danger')
            return render_template('edit_profile.html', user=user)

        user.name = name
        user.skills = skills
        user.career_interests = career_interests
        user.industry = industry
        user.years_experience = int(years_experience) if years_experience is not None and years_experience != "" else None
        user.current_company = current_company
        user.education = education
        user.bio = bio
        user.location_city = location_city
        user.location_state = location_state
        user.location_country = location_country
        user.mentoring_preference = mentoring_preference

        db.session.commit()
        flash('Profile updated.', 'success')
        return redirect(url_for('profile'))

    return render_template('edit_profile.html', user=user)


# -------------------- Mock Google OAuth -------------------- #

@app.route('/login/google')
def login_google():
    """
    Mock Google OAuth login.
    In production, replace with real Google OAuth flow.
    """
    google_email = request.args.get('email', 'mock.alumni@techdept.edu').lower()
    google_name = request.args.get('name', 'Mock Alumni User')
    google_role = request.args.get('role', 'alumni').lower()
    if google_role not in ['student', 'alumni']:
        google_role = 'alumni'

    user = User.query.filter_by(email=google_email).first()

    if user is None:
        user = User(
            name=google_name,
            email=google_email,
            role=google_role,
            skills='',
            is_google_account=True
        )
        if google_role == 'student':
            # Dev: auto-verify google student as well
            user.is_student_verified = True
        elif google_role == 'alumni':
            user.is_alumni_approved = False
        db.session.add(user)
        db.session.commit()
        flash('Google account linked and user created. Please complete your profile.', 'info')

    if not user.is_active:
        if user.role == 'student':
            flash('Your student account is not yet verified.', 'warning')
        elif user.role == 'alumni':
            flash('Your alumni account is pending admin approval.', 'warning')
        else:
            flash('Your account is not active.', 'warning')
        return redirect(url_for('login'))

    session.clear()
    session['user_id'] = user.id
    flash('Logged in with Google.', 'success')
    return redirect(url_for('dashboard'))


# -------------------- Matching Routes -------------------- #

@app.route('/api/matches', methods=['GET'])
@login_required
def api_matches():
    user = g.user
    try:
        k = int(request.args.get('k', 5))
        if k <= 0:
            k = 5
    except ValueError:
        k = 5

    restrict_role = request.args.get('restrict_role')
    if restrict_role not in (None, '', 'student', 'alumni'):
        restrict_role = None

    matches = get_matches_for_user(user, k=k, restrict_to_role=restrict_role or None)

    result = []
    for matched_user, score in matches:
        result.append({
            "id": matched_user.id,
            "name": matched_user.name,
            "role": matched_user.role,
            "skills": matched_user.skills,
            "career_interests": matched_user.career_interests,
            "location_state": matched_user.location_state,
            "location_country": matched_user.location_country,
            "years_experience": matched_user.years_experience,
            "current_company": matched_user.current_company,
            "match_score": round(score, 4),
        })

    return jsonify({
        "user_id": user.id,
        "user_name": user.name,
        "matches": result,
    })


@app.route('/matches')
@login_required
def matches_page():
    user = g.user
    restrict_role = 'alumni' if user.role == 'student' else None
    matches = get_matches_for_user(user, k=10, restrict_to_role=restrict_role)
    match_list = [{"user": u, "score": round(score, 4)} for (u, score) in matches]
    return render_template('matches.html', matches=match_list)


# -------------------- Connections & Mentorship -------------------- #

@app.route('/connections')
@login_required
def connections_list():
    user = g.user

    incoming = Connection.query.filter_by(
        receiver_id=user.id, status='pending'
    ).all()

    outgoing = Connection.query.filter_by(
        requester_id=user.id, status='pending'
    ).all()

    accepted = Connection.query.filter(
        or_(
            and_(Connection.requester_id == user.id, Connection.status == 'accepted'),
            and_(Connection.receiver_id == user.id, Connection.status == 'accepted'),
        )
    ).all()

    blocked = Block.query.filter_by(blocker_id=user.id).all()

    return render_template(
        'connections.html',
        incoming=incoming,
        outgoing=outgoing,
        accepted=accepted,
        blocked=blocked,
    )


@app.route('/connections/send/<int:user_id>', methods=['POST'])
@login_required
def send_connection_request(user_id):
    current = g.user
    if current.id == user_id:
        flash("You cannot send a connection request to yourself.", "warning")
        return redirect(url_for('connections_list'))

    target = User.query.get_or_404(user_id)

    if is_blocked_between(current, target):
        flash("You cannot connect because one of you has blocked the other.", "danger")
        return redirect(url_for('connections_list'))

    existing = get_connection_between(current, target)
    if existing:
        if existing.status == 'pending':
            flash("A connection request already exists.", "info")
        elif existing.status == 'accepted':
            flash("You are already connected.", "info")
        elif existing.status == 'declined':
            flash("Previous request was declined. You may try again later.", "info")
        return redirect(url_for('connections_list'))

    conn = Connection(
        requester_id=current.id,
        receiver_id=target.id,
        status='pending'
    )
    db.session.add(conn)
    db.session.commit()

    flash(f"Connection request sent to {target.name}.", "success")
    return redirect(url_for('connections_list'))


@app.route('/connections/respond/<int:connection_id>/<string:action>', methods=['POST'])
@login_required
def respond_connection_request(connection_id, action):
    user = g.user
    conn = Connection.query.get_or_404(connection_id)

    if conn.receiver_id != user.id:
        flash("You are not allowed to respond to this request.", "danger")
        return redirect(url_for('connections_list'))

    if conn.status != 'pending':
        flash("This request has already been handled.", "info")
        return redirect(url_for('connections_list'))

    if action not in ('accept', 'decline'):
        flash("Invalid action.", "danger")
        return redirect(url_for('connections_list'))

    if action == 'accept':
        conn.status = 'accepted'
        flash(f"You are now connected with {conn.requester.name}.", "success")
    else:
        conn.status = 'declined'
        flash("Connection request declined.", "info")

    db.session.commit()
    return redirect(url_for('connections_list'))


@app.route('/connections/block/<int:user_id>', methods=['POST'])
@login_required
def block_user(user_id):
    current = g.user

    if current.id == user_id:
        flash("You cannot block yourself.", "warning")
        return redirect(url_for('connections_list'))

    target = User.query.get_or_404(user_id)

    if is_blocked_between(current, target):
        flash("User is already blocked.", "info")
        return redirect(url_for('connections_list'))

    block = Block(blocker_id=current.id, blocked_id=target.id)
    db.session.add(block)

    Connection.query.filter(
        or_(
            and_(Connection.requester_id == current.id, Connection.receiver_id == target.id),
            and_(Connection.requester_id == target.id, Connection.receiver_id == current.id),
        )
    ).delete(synchronize_session=False)

    db.session.commit()
    flash(f"You have blocked {target.name}. Connections removed and messages disabled.", "success")
    return redirect(url_for('connections_list'))


@app.route('/connections/unblock/<int:user_id>', methods=['POST'])
@login_required
def unblock_user(user_id):
    current = g.user
    block = Block.query.filter_by(blocker_id=current.id, blocked_id=user_id).first()

    if not block:
        flash("This user is not blocked.", "info")
        return redirect(url_for('connections_list'))

    db.session.delete(block)
    db.session.commit()
    flash("User unblocked.", "success")
    return redirect(url_for('connections_list'))


@app.route('/connections/mentorship/<int:connection_id>/toggle', methods=['POST'])
@login_required
def toggle_mentorship(connection_id):
    user = g.user
    conn = Connection.query.get_or_404(connection_id)

    if user.id not in (conn.requester_id, conn.receiver_id):
        flash("You are not part of this connection.", "danger")
        return redirect(url_for('connections_list'))

    if conn.status != 'accepted':
        flash("Only accepted connections can be tagged as mentorship.", "warning")
        return redirect(url_for('connections_list'))

    conn.is_mentorship = not conn.is_mentorship
    db.session.commit()

    msg = "Marked as mentorship relationship." if conn.is_mentorship else "Mentorship tag removed."
    flash(msg, "success")
    return redirect(url_for('connections_list'))


@app.route('/mentorships')
@login_required
def mentorships():
    user = g.user
    mentorship_conns = Connection.query.filter(
        Connection.is_mentorship.is_(True),
        Connection.status == 'accepted',
        or_(Connection.requester_id == user.id, Connection.receiver_id == user.id)
    ).all()
    return render_template('mentorships.html', mentorships=mentorship_conns)


# -------------------- Messaging -------------------- #

@app.route('/messages/<int:user_id>', methods=['GET', 'POST'])
@login_required
def chat(user_id):
    current = g.user
    other = User.query.get_or_404(user_id)

    if is_blocked_between(current, other):
        flash("Messaging is not allowed because one of you has blocked the other.", "danger")
        return redirect(url_for('connections_list'))

    if not are_connected(current, other):
        flash("You can only message users you are connected with.", "warning")
        return redirect(url_for('connections_list'))

    if request.method == 'POST':
        content = request.form.get('content', '').strip()
        if not content:
            flash("Message cannot be empty.", "warning")
        else:
            msg = Message(
                sender_id=current.id,
                receiver_id=other.id,
                content=content
            )
            db.session.add(msg)
            db.session.commit()
            flash("Message sent.", "success")
        return redirect(url_for('chat', user_id=other.id))

    messages = Message.query.filter(
        or_(
            and_(Message.sender_id == current.id, Message.receiver_id == other.id),
            and_(Message.sender_id == other.id, Message.receiver_id == current.id),
        )
    ).order_by(Message.created_at.asc()).all()

    for m in messages:
        if m.receiver_id == current.id and not m.is_read:
            m.is_read = True
    db.session.commit()

    return render_template('chat.html', other=other, messages=messages)


# -------------------- Search -------------------- #

@app.route('/search', methods=['GET'])
@login_required
def search():
    name_q = request.args.get('name', '').strip()
    role_q = request.args.get('role', '').strip().lower()
    skills_q = request.args.get('skills', '').strip()
    industry_q = request.args.get('industry', '').strip()
    location_q = request.args.get('location', '').strip()

    query = User.query

    if g.user:
        query = query.filter(User.id != g.user.id)

    if name_q:
        query = query.filter(User.name.ilike(f"%{name_q}%"))

    if role_q in ('student', 'alumni'):
        query = query.filter(User.role == role_q)

    if skills_q:
        query = query.filter(User.skills.ilike(f"%{skills_q}%"))

    if industry_q:
        query = query.filter(User.industry.ilike(f"%{industry_q}%"))

    if location_q:
        loc_pattern = f"%{location_q}%"
        query = query.filter(
            or_(
                User.location_city.ilike(loc_pattern),
                User.location_state.ilike(loc_pattern),
                User.location_country.ilike(loc_pattern),
            )
        )

    users = [u for u in query.all() if u.is_active]

    return render_template(
        'search.html',
        users=users,
        name_q=name_q,
        role_q=role_q,
        skills_q=skills_q,
        industry_q=industry_q,
        location_q=location_q,
    )


# -------------------- Admin Dashboard -------------------- #

@app.route('/admin')
@admin_required
def admin_dashboard():
    total_users = User.query.count()
    active_users = sum(1 for u in User.query.all() if u.is_active)
    suspended_users = User.query.filter_by(is_suspended=True).count()

    total_connections = Connection.query.count()
    accepted_connections = Connection.query.filter_by(status='accepted').count()
    pending_connections = Connection.query.filter_by(status='pending').count()

    total_messages = Message.query.count()
    unread_messages = Message.query.filter_by(is_read=False).count()

    mentoring_counts = (
        db.session.query(User.mentoring_preference, func.count(User.id))
        .group_by(User.mentoring_preference)
        .all()
    )
    mentoring_summary = {k or "unspecified": v for k, v in mentoring_counts}

    users = User.query.order_by(User.created_at.desc()).all()
    connections = Connection.query.order_by(Connection.created_at.desc()).limit(50).all()
    messages = Message.query.order_by(Message.created_at.desc()).limit(100).all()

    # NEW: lists used for approve/decline UI
    pending_alumni = User.query.filter_by(role='alumni', is_alumni_approved=False).all()
    pending_students = User.query.filter_by(role='student', is_student_verified=False).all()

    return render_template(
        'admin_dashboard.html',
        total_users=total_users,
        active_users=active_users,
        suspended_users=suspended_users,
        total_connections=total_connections,
        accepted_connections=accepted_connections,
        pending_connections=pending_connections,
        total_messages=total_messages,
        unread_messages=unread_messages,
        mentoring_summary=mentoring_summary,
        users=users,
        connections=connections,
        messages=messages,
        pending_alumni=pending_alumni,
        pending_students=pending_students,
    )


# ---- Approve Alumni / Verify Student ---- #

@app.route('/admin/users/<int:user_id>/approve_alumni', methods=['POST'])
@admin_required
def admin_approve_alumni(user_id):
    user = User.query.get_or_404(user_id)

    if user.role != 'alumni':
        flash("This user is not an alumni.", "warning")
        return redirect(url_for('admin_dashboard'))

    user.is_alumni_approved = True
    db.session.commit()
    flash(f"Alumni {user.name} has been approved.", "success")
    return redirect(url_for('admin_dashboard'))


@app.route('/admin/users/<int:user_id>/verify_student', methods=['POST'])
@admin_required
def admin_verify_student(user_id):
    user = User.query.get_or_404(user_id)

    if user.role != 'student':
        flash("This user is not a student.", "warning")
        return redirect(url_for('admin_dashboard'))

    user.is_student_verified = True
    db.session.commit()
    flash(f"Student {user.name} has been verified.", "success")
    return redirect(url_for('admin_dashboard'))


@app.route('/admin/users/<int:user_id>/delete', methods=['POST'])
@admin_required
def admin_delete_user(user_id):
    user = User.query.get_or_404(user_id)

    if user.is_admin:
        flash("You cannot delete another admin.", "danger")
        return redirect(url_for('admin_dashboard'))

    Message.query.filter(
        or_(Message.sender_id == user.id, Message.receiver_id == user.id)
    ).delete(synchronize_session=False)

    Connection.query.filter(
        or_(
            Connection.requester_id == user.id,
            Connection.receiver_id == user.id
        )
    ).delete(synchronize_session=False)

    Block.query.filter(
        or_(
            Block.blocker_id == user.id,
            Block.blocked_id == user.id
        )
    ).delete(synchronize_session=False)

    db.session.delete(user)
    db.session.commit()

    flash("User and related data deleted.", "success")
    return redirect(url_for('admin_dashboard'))


@app.route('/admin/users/<int:user_id>/suspend', methods=['POST'])
@admin_required
def admin_suspend_user(user_id):
    user = User.query.get_or_404(user_id)

    if user.is_admin:
        flash("You cannot suspend another admin.", "danger")
        return redirect(url_for('admin_dashboard'))

    user.is_suspended = True
    db.session.commit()
    flash("User suspended (cannot log in or interact).", "success")
    return redirect(url_for('admin_dashboard'))


@app.route('/admin/users/<int:user_id>/unsuspend', methods=['POST'])
@admin_required
def admin_unsuspend_user(user_id):
    user = User.query.get_or_404(user_id)
    user.is_suspended = False
    db.session.commit()
    flash("User unsuspended.", "success")
    return redirect(url_for('admin_dashboard'))


@app.route('/admin/messages/<int:message_id>/delete', methods=['POST'])
@admin_required
def admin_delete_message(message_id):
    msg = Message.query.get_or_404(message_id)
    db.session.delete(msg)
    db.session.commit()
    flash("Message deleted.", "success")
    return redirect(url_for('admin_dashboard'))


@app.route('/admin/connections/<int:connection_id>/delete', methods=['POST'])
@admin_required
def admin_delete_connection(connection_id):
    conn = Connection.query.get_or_404(connection_id)
    db.session.delete(conn)
    db.session.commit()
    flash("Connection removed.", "success")
    return redirect(url_for('admin_dashboard'))


# -------------------- Dev helper: make me admin -------------------- #

@app.route('/dev/make_me_admin')
def make_me_admin():
    # CHANGE THIS to the email you used to sign up
    email = "user1@edu.com"

    user = User.query.filter_by(email=email.lower()).first()
    if not user:
        return f"No user found with email {email}", 404

    # Make this account active and admin
    if user.role == "alumni":
        user.is_alumni_approved = True
    if user.role == "student":
        user.is_student_verified = True

    user.is_admin = True
    db.session.commit()

    return f"{email} is now admin and active."


# -------------------- App entry -------------------- #

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True) 