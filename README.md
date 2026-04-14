# Alumni-Student Networking Platform

Flask + SQLite app with:

- Email/password auth and mock Google login
- Roles: student / alumni with verification and approval
- Profiles with skills, interests, location, mentoring preference
- AI/ML matching using TF-IDF + KNN
- Connections (requests, accepted, declined), blocking, messaging
- Mentorship tagging on connections
- Advanced search and admin dashboard

## Quick start

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5000 in your browser.
