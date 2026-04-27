# CodeTrack

CodeTrack is an instructor-led coding exercise platform for students and teachers.
It supports exercise publishing, student submissions, teacher reviews, progress tracking, notifications, and a backend connected to MongoDB Atlas.

## Features
- Teacher role and student role support
- Login and signup flows
- Exercise creation and student submissions
- Submission reviews with comments and score overrides
- Progress comments, notifications, and activity logging
- Contact form with backend storage
- Local development and Vercel deployment support

## Project structure
- `index.html`, `about.html`, `contact.html`, `faq.html`, `exercises.html`, `submissions.html`, `progress.html`, `login.html`, `signup.html`
  - Frontend pages and UI
- `app.js`, `script.js`, `theme.js`, `styles.css`
  - Frontend logic and styling
- `server.js`
  - Express backend server and MongoDB API
- `api/index.js`
  - Vercel serverless entrypoint for the backend
- `DATABASE_SETUP.md`
  - MongoDB Atlas and deployment setup instructions
- `package.json`
  - Dependencies and scripts

## Backend
The backend is built with:
- Node.js
- Express
- MongoDB Atlas
- `mongodb` native driver

### Key backend behavior
- Reads `.env` for `MONGODB_URI`, `MONGODB_DB`, and `PORT`
- Uses `X-CodeTrack-Email` and `X-CodeTrack-Role` headers for demo authentication
- Serves API routes under `/api`
- Stores application data in MongoDB collections including users, exercises, submissions, reviews, progress comments, notifications, and activity logs

## Setup and run locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file in the project root with:
   ```bash
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/codetrack?retryWrites=true&w=majority&appName=CodeTrack
   MONGODB_DB=codetrack
   PORT=3000
   ```
3. Start the app:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000` in your browser.

## Deployment
- `api/index.js` is provided for Vercel deployment.
- Use `vercel.json` and set the environment variables in Vercel:
  - `MONGODB_URI`
  - `MONGODB_DB`

## Notes
- This project stores passwords directly in the database for demo/classroom use only.
- For production, replace password storage with hashed authentication.

## Contact
For support or questions about this project, use the contact page in the app.
