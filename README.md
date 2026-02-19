<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# InsightStream - Executive Assistant

AI-powered document analysis tool that transforms complex documents into actionable insights with BLUF summaries, action items, and professional refinements.

✨ **Now with Supabase Integration!** - User authentication and usage tracking powered by Supabase.

View your app in AI Studio: https://ai.studio/apps/drive/1q75pSCKCBqs1j5jUVmJeAaeficivh5Zk

## 🚀 Setup & Run Locally

**Prerequisites:** Node.js (v16 or higher)

### 1. Install dependencies
```bash
npm install
```

### 2. Configure Supabase

#### A. Create a Supabase project
1. Go to [Supabase](https://supabase.com) and create a new project
2. Wait for the database to be ready (takes ~2 minutes)

#### B. Set up the database
1. Go to your Supabase project dashboard
2. Click on **SQL Editor** in the left sidebar
3. Create a new query
4. Copy and paste the contents of `supabase-schema.sql`
5. Click **Run** to execute the SQL

#### C. Get your API credentials
1. Go to **Project Settings** > **API**
2. Copy your **Project URL** (looks like `https://xxxxx.supabase.co`)
3. Copy your **anon public** key

#### D. Configure environment variables
Open `.env.local` and update:
```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### 3. Configure Gemini API
1. Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Update `VITE_GEMINI_API_KEY` in `.env.local`

### 4. Run the development server
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## 📦 Build for Production
```bash
npm run build
npm run preview
```

## ✨ Features

### Core Features
- **BLUF Summaries**: Bottom Line Up Front executive summaries
- **Action Items**: Automatic extraction of tasks, owners, and deadlines  
- **Professional Refinement**: Polished communication ready for sharing
- **Copy to Email/Slack**: One-click formatting for team communication

### New: Supabase Integration
- 🔐 **Secure Authentication**: Email/password signup and login
- 📊 **Usage Tracking**: Track usage per user in the database
- 🎯 **Free Tier**: 3 free analyses for non-authenticated users
- ♾️ **Unlimited Access**: Logged-in users get unlimited analyses
- 🔄 **Session Persistence**: Stay logged in across browser sessions

## 🗄️ Database Schema

The app uses a simple `profiles` table:
```sql
profiles
  - id (UUID, references auth.users)
  - email (TEXT)
  - usage_count (INTEGER)
  - created_at (TIMESTAMP)
  - updated_at (TIMESTAMP)
```

## 🛠️ Tech Stack
- React 19 + TypeScript
- Vite
- Tailwind CSS
- Google Gemini 1.5 Flash
- Supabase (Auth + Database)

## 🔒 Security Notes
- Never commit your `.env.local` file (already in `.gitignore`)
- Row Level Security (RLS) is enabled on all tables
- Users can only access their own data
- API keys are stored securely in environment variables

## 📝 Environment Variables

Required variables in `.env.local`:
```env
VITE_GEMINI_API_KEY=           # Your Google Gemini API key
VITE_SUPABASE_URL=              # Your Supabase project URL
VITE_SUPABASE_ANON_KEY=         # Your Supabase anon public key
```

## 🆘 Troubleshooting

**"Failed to fetch"** error?
- Check that your Supabase URL and API key are correct
- Make sure you ran the `supabase-schema.sql` file

**Can't sign up?**
- Check Supabase logs in Dashboard > Logs
- Verify email confirmation is disabled for development (in Authentication > Settings)

**Usage count not updating?**
- Check that Row Level Security policies are set up correctly
- Verify the user is logged in successfully

