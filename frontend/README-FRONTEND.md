# Frontend File Structure

## 📁 Complete File Organization

```
frontend/
│
├── index.html                    Main HTML file
│
├── css/
│   └── styles.css               Complete CSS styling
│
└── js/
    ├── config.js                Configuration & utilities
    ├── auth.js                  Login & authentication
    ├── feed.js                  Posts & feed logic
    ├── calendar.js              Calendar events
    ├── clubs.js                 Clubs management
    ├── messages.js              Private messaging
    └── app.js                   Main app controller
```

## 📝 What Each File Does

### HTML
- **index.html** - Main structure, all pages, modals

### CSS
- **styles.css** - All styling (login, layout, posts, calendar, clubs, messages)

### JavaScript

**config.js**
- API URL configuration
- Role labels (Bulgarian)
- Event type colors
- Utility functions (getInitials, formatTime, formatDate)
- Global state management

**auth.js**
- Login form handling
- User authentication
- Show/hide app based on login
- Set user info and avatars
- Logout functionality
- Role-based UI adjustments

**feed.js**
- Load and render posts
- Create new posts
- Like/unlike posts
- Show comments modal
- Add comments
- XSS protection

**calendar.js**
- Load calendar events
- Render event cards
- Calendar widget (sidebar)
- Add new events (with permissions)
- Role-based event creation

**clubs.js**
- Load and render clubs
- Clubs widget (sidebar)
- Create new clubs
- Join clubs
- Request approval (students)

**messages.js**
- Load conversations list
- Display messages
- Send messages
- Real-time message loading

**app.js**
- Page navigation
- Initialize app
- Auto-refresh feed
- Keyboard shortcuts
- Online/offline handling

## 🎨 Design Features

### Clean Twitter-Style Interface
- Three-column layout (sidebar, main, widgets)
- Sticky headers
- Smooth transitions
- Professional color scheme
- Responsive design

### Color Scheme
- Background: #f7f9fa (light gray)
- Primary: #1d9bf0 (Twitter blue)
- Text: #0f1419 (dark)
- Secondary: #536471 (gray)
- Borders: #eff3f4 (light border)

### Role Badges
- Admin: Red (#ff6b6b)
- Moderator: Teal (#4ecdc4)
- Teacher: Blue (#45b7d1)
- Student: Green (#96ceb4)
- Parent: Yellow (#ffeaa7)

## 🔧 Easy Customization

### Change Colors
Edit `css/styles.css`:
```css
.btn-primary {
  background: #1d9bf0;  /* Change this */
}
```

### Change API URL
Edit `js/config.js`:
```javascript
const CONFIG = {
  API_URL: 'http://localhost:3001/api'  /* Change this */
};
```

### Add New Page
1. Add nav item in `index.html`
2. Add page div with id `page-yourpage`
3. Create `js/yourpage.js` with load function
4. Add case in `showPage()` in `app.js`
5. Link script in `index.html`

### Modify Text
All Bulgarian text is in the HTML and JS files.
Search and replace to change any label.

## 🚀 How to Use

### Step 1: Start Backend
```cmd
cd backend
node server.js
```

### Step 2: Open Frontend
- Option A: Double-click `index.html`
- Option B: Use a web server:
  ```cmd
  cd frontend
  python -m http.server 8080
  ```
  Then visit: http://localhost:8080

### Step 3: Login
Use sample credentials:
- Student: `student_11а_1` / `student123`
- Teacher: `teacher1` / `teacher123`
- Admin: `admin` / `admin123`

## 📱 Features by Role

### Students
- ✅ Create posts (public, grade, class)
- ✅ Like and comment
- ✅ View calendar (global + class events)
- ✅ Join clubs
- ✅ Request club creation
- ✅ Send messages

### Teachers
- ✅ All student features
- ✅ Create calendar events (own class)
- ✅ Create clubs directly
- ✅ Approve club requests

### Moderators (Principal)
- ✅ All teacher features
- ✅ Create any calendar event
- ❌ Cannot ban users

### Admins
- ✅ Everything
- ✅ Ban users
- ✅ Full control

### Parents
- ✅ View posts
- ✅ Comment (but limited posting)
- ✅ View calendar
- ❌ Cannot create clubs

## 🐛 Troubleshooting

### Posts not loading
- Check backend is running on port 3001
- Check browser console for errors
- Verify API URL in `config.js`

### Can't login
- Check backend has sample data
- Try: `student_11а_1` / `student123`
- Check browser console

### Styles not working
- Make sure `css/styles.css` exists
- Check path in `index.html`
- Hard refresh: Ctrl+Shift+R

### Scripts not loading
- Check all JS files are in `js/` folder
- Check script tags at end of `index.html`
- Open browser console for errors

## 🎯 Next Steps

### Recommended Improvements
1. **Image uploads** - Add to post composer
2. **User profiles** - Click name to see profile
3. **Notifications** - Real-time notifications
4. **Search** - Search posts, users, clubs
5. **Admin panel** - User management UI
6. **Dark mode** - Toggle in settings
7. **Mobile app** - React Native version

### Easy Wins
- Add more club icons in `config.js`
- Change colors in `styles.css`
- Add more event types
- Customize role badges
- Add user avatars (upload)

## 📖 Code Examples

### Add a new event type:
```javascript
// In config.js
EVENT_TYPES: {
  'homework': { label: 'Домашна работа', color: '#9b59b6' }
}
```

### Change post character limit:
```javascript
// In feed.js, in composer
if (content.length > 500) {
  showError('Максимум 500 символа');
  return;
}
```

### Add reaction types:
```javascript
// Extend the like button to have multiple reactions
// Similar to Facebook reactions
```

---

**Everything is ready to use!** Just open `index.html` after starting the backend. 🎉
