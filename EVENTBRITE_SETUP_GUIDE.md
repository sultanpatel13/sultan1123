# Eventbrite Event Fetching - Step by Step Guide

This guide explains how to fetch real events from Eventbrite API and display them in your admin dashboard.

## ✅ What Was Fixed

1. **Improved API Request**: Enhanced the Eventbrite API call with proper parameters
2. **Better Error Handling**: Added detailed error messages and logging
3. **Data Processing**: Improved parsing of event data (name, dates, descriptions, locations)
4. **Duplicate Prevention**: Better duplicate detection
5. **HTML Cleaning**: Removes HTML tags from descriptions

## 📋 Prerequisites

1. ✅ Eventbrite Private Token is set in `.env` file: `EVENTBRITE_TOKEN=OWRLVBP4J3BIHP3RGNDQ`
2. ✅ Flask app is running
3. ✅ You have admin access

## 🚀 Step-by-Step Instructions

### Step 1: Verify Environment Setup

1. Check that your `.env` file exists and contains:
   ```
   EVENTBRITE_TOKEN=OWRLVBP4J3BIHP3RGNDQ
   SECRET_KEY=change-this-secret-key-in-production
   ```

2. Restart your Flask app to load the environment variables:
   ```bash
   # Stop the current app (Ctrl+C)
   # Then restart:
   .\venv\Scripts\python.exe app.py
   ```

### Step 2: Access Admin Dashboard

1. Log in to your application as an admin user
2. Navigate to the Admin Dashboard:
   - Click on your profile icon (top right)
   - Select "Admin Dashboard" from the dropdown
   - OR go directly to: `http://localhost:5000/admin`

### Step 3: Fetch Events from Eventbrite

**Option A: Using Template (Admin Dashboard HTML)**
1. Scroll down to the "Events" section
2. Click the **"Fetch Events (External)"** button
3. Wait for the page to reload
4. Check the flash message at the top:
   - ✅ Success: "Successfully fetched X events from Eventbrite."
   - ❌ Error: Check the error message for details

**Option B: Using React Component (Admin Dashboard React)**
1. If the React component is loaded, look for the "Events Management" card
2. Click the **"Fetch from Eventbrite"** button
3. Wait for the response

### Step 4: View Fetched Events

1. After fetching, click **"View Events"** or **"View All Events"** button
2. OR navigate to: `http://localhost:5000/events`
3. You should see the events fetched from Eventbrite

### Step 5: Verify Events

Check that events have:
- ✅ Event title
- ✅ Start date/time
- ✅ Description (if available)
- ✅ Location (Online or venue)
- ✅ External link to Eventbrite page
- ✅ Source marked as "eventbrite"

## 🔧 Troubleshooting

### Issue: "Mock events created" instead of real events

**Solution:**
- Check that `EVENTBRITE_TOKEN` is set in `.env`
- Restart the Flask app after adding the token
- Verify the token is correct (should be: `OWRLVBP4J3BIHP3RGNDQ`)

### Issue: "Eventbrite fetch failed" error

**Possible causes:**
1. **Invalid Token**: The token might be incorrect or expired
   - Check Eventbrite developer dashboard
   - Regenerate token if needed

2. **Network Issues**: 
   - Check internet connection
   - Check if Eventbrite API is accessible

3. **API Rate Limits**:
   - Eventbrite has rate limits (2000 requests/hour)
   - Wait a few minutes and try again

4. **Token Permissions**:
   - Ensure the token has "read" permissions for public events

### Issue: "No events found from Eventbrite"

**Solution:**
- The search query might be too specific
- Try modifying the search parameters in `app.py`:
  ```python
  params = {
      'q': 'technology',  # Change search term
      'sort_by': 'date',
      'status': 'live',
      'order_by': 'start_asc',
      'expand': 'venue,organizer',
      'page_size': 50  # Increase number of results
  }
  ```

### Issue: Events are duplicates

**Solution:**
- The duplicate detection is working correctly
- Events with the same title and start time are skipped
- This is expected behavior

## 📝 API Parameters Explained

The current implementation uses these Eventbrite API parameters:

- `q: 'online'` - Search query (searches for "online" events)
- `sort_by: 'date'` - Sort results by date
- `status: 'live'` - Only fetch live/active events
- `order_by: 'start_asc'` - Order by start time (ascending)
- `expand: 'venue,organizer'` - Get additional venue and organizer details
- `page_size: 20` - Fetch up to 20 events per request

## 🎯 Customizing the Search

To customize what events are fetched, edit `app.py` around line 741:

```python
params = {
    'q': 'your_search_term',  # Change this
    'sort_by': 'date',
    'status': 'live',
    'order_by': 'start_asc',
    'expand': 'venue,organizer',
    'page_size': 50  # Increase for more results
}
```

Popular search terms:
- `'online'` - Online events
- `'technology'` - Tech events
- `'networking'` - Networking events
- `'workshop'` - Workshops
- `'conference'` - Conferences

## 📊 What Gets Fetched

For each event, the system fetches:
- ✅ Event title
- ✅ Event description (HTML cleaned)
- ✅ Start date/time (UTC)
- ✅ End date/time (UTC)
- ✅ Location (venue or "Online")
- ✅ Online status
- ✅ Free/paid status
- ✅ External Eventbrite URL

## 🔄 Automatic vs Manual Fetching

**Current Setup:**
- Manual fetching only (via Admin Dashboard button)
- No automatic background fetching (to avoid slow page loads)

**To Enable Auto-Fetch:**
You can modify `events_list()` route to auto-fetch if no events exist, but this is not recommended as it slows down page loads.

## 📞 Support

If you continue to have issues:
1. Check Flask app logs for detailed error messages
2. Verify Eventbrite token is valid
3. Test the API directly using curl:
   ```bash
   curl -H "Authorization: Bearer OWRLVBP4J3BIHP3RGNDQ" "https://www.eventbriteapi.com/v3/events/search/?q=online&status=live"
   ```

## ✅ Success Indicators

You'll know it's working when:
- ✅ Flash message shows: "Successfully fetched X events from Eventbrite"
- ✅ Events appear on `/events` page
- ✅ Events show "eventbrite" as source
- ✅ Events have real titles, dates, and descriptions
- ✅ External links work and point to Eventbrite

---

**Last Updated:** 2024-12-19
**Status:** ✅ Fully Functional

