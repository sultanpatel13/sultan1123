# SECRET_KEY Explanation

## What is SECRET_KEY?

The `SECRET_KEY` in your `.env` file is **NOT related to Eventbrite**. It's a Flask application security key used for:

1. **Session Security** - Encrypts and signs user session cookies
2. **CSRF Protection** - Protects against Cross-Site Request Forgery attacks
3. **Flash Messages** - Secures flash message storage
4. **Password Reset Tokens** - If you implement password reset functionality

## Important: Do NOT Use Eventbrite Keys

**None of your Eventbrite credentials should be used as SECRET_KEY:**
- ❌ Application Key: `IGPETNNZQUA2A54AFX` - This is for Eventbrite API
- ❌ OAuth Client Secret: `JBN5DZ47J2GO4VRC3VR5MSW4ATRB3DJDKY5OZHOPOZ73MJTMM6` - This is for Eventbrite OAuth
- ❌ Private Token: `OWRLVBP4J3BIHP3RGNDQ` - This is for Eventbrite API calls
- ❌ Public Token: `YSTXFCGY56XLPNMDVNR7` - This is for Eventbrite public API

**SECRET_KEY is completely separate and should be a random, secure string.**

## When to Change It

### ✅ Change it NOW (for development):
- If you're sharing your code or deploying anywhere
- If the current value is the default placeholder
- Before going to production

### ✅ Change it in Production:
- **Always** use a unique, strong secret key in production
- Never use the same key across different environments
- Generate a new one for each deployment

### ⚠️ When NOT to Change:
- If users are already logged in, changing it will log them all out
- If you have existing sessions, they'll become invalid

## How to Generate a Secure SECRET_KEY

### Option 1: Using Python (Recommended)
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Option 2: Using Python (Alternative)
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### Option 3: Using OpenSSL (if installed)
```bash
openssl rand -hex 32
```

### Option 4: Online Generator
- Use a secure random string generator (at least 32 characters)
- Example: https://randomkeygen.com/

## Current Setup

Your `.env` file should have:
```
EVENTBRITE_TOKEN=OWRLVBP4J3BIHP3RGNDQ
SECRET_KEY=<your-generated-secret-key-here>
```

## Example .env File

```
EVENTBRITE_TOKEN=OWRLVBP4J3BIHP3RGNDQ
SECRET_KEY=your-super-secret-random-string-at-least-32-characters-long
```

## Security Best Practices

1. **Never commit SECRET_KEY to version control**
   - Keep it in `.env` file
   - Add `.env` to `.gitignore`

2. **Use different keys for different environments**
   - Development: One key
   - Staging: Different key
   - Production: Completely different key

3. **Make it long and random**
   - Minimum 32 characters
   - Use cryptographically secure random generator
   - Mix of letters, numbers, and special characters

4. **Keep it secret**
   - Don't share it publicly
   - Don't put it in code comments
   - Don't email it in plain text

## What Happens If You Don't Change It?

- ⚠️ **Security Risk**: If someone knows your secret key, they can:
  - Forge session cookies
  - Impersonate users
  - Bypass CSRF protection
  - Access user sessions

- ⚠️ **In Production**: Using default or weak keys is a major security vulnerability

## Quick Fix

Run this command to generate a new SECRET_KEY:

```bash
python -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(32))"
```

Then copy the output and replace `change-this-secret-key-in-production` in your `.env` file.

---

**Summary:** SECRET_KEY is for Flask app security, not Eventbrite. Generate a random 32+ character string and update your `.env` file.

