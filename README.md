# Digital Lucky Draw Ticket Management System

A complete, full-stack, mobile-responsive **Digital Lucky Draw Ticket Management Website** built with **React + Vite**, **Node.js + Express**, and **PostgreSQL (Supabase)**.

This system replaces physical paper lucky draw tickets for **50 authorized sellers** and provides real-time monitoring, atomic PostgreSQL concurrency protection, QR-based customer booking, and downloadable **JPG digital tickets**.

> **Legal Notice:** Do not enable live paid lucky draw sales until all required local/state legal permissions and authorizations have been confirmed. Administrators can pause or enable ticket sales at any time from the **Tickets & Pool Setup** tab.

---

## 1. Features

### Administrator Portal (`ADMIN`)
- **Secure JWT Login** with bcrypt password hashing.
- **Real-time Summary Dashboard**: Total Sellers, Total Tickets, Tickets Sold, Available Tickets, Reserved Tickets, and Total Collection (with Cash & UPI breakdown).
- **Manage 50 Seller Accounts**:
  - Pre-seeded with 50 authorized seller accounts (`seller01` to `seller50`, with `seller01` configured as **Reenal**).
  - Create new sellers, edit seller details, activate/deactivate accounts, and reset seller passwords.
- **Seller-Wise Tracking & Drill-Down**:
  - View tickets sold, total collection, cash/UPI split, amount submitted to admin, and outstanding balance per seller.
  - Click any seller's name (e.g., **Reenal**) to inspect every ticket sold by that seller.
- **Sequential Ticket Pool Configuration**:
  - Configure total ticket quantity (`001`–`999` formatted as 3 digits; `1000`+ formatted as 4 digits).
  - Configure ticket price, temporary reservation expiry (default `5 minutes`), event title, and pause/enable sales.
  - Manage individual ticket status (`AVAILABLE`, `SOLD`, `REDEEMED`).
- **Customer & Transaction Monitoring**:
  - Search tickets by ticket number and customers by full name or mobile number.
  - Record and track seller money settlements.
  - View complete chronological system activity logs.
  - Export Sales, Sellers, and Transactions reports to **Excel (`.xlsx`)** and **CSV (`.csv`)**.

### Authorized Seller Portal (`SELLER`)
- **Mobile-First Seller Dashboard**: Displays Seller Name, Seller Code, Tickets Sold, Total Collection, Pending Payments, Submitted Amount, and Outstanding Settlement Balance.
- **Color-Coded Ticket Selection Grid**:
  - **Green** = `AVAILABLE`
  - **Orange** = `RESERVED`
  - **Red** = `SOLD`
  - **Dark Grey** = `REDEEMED`
- **Customer QR Code Booking Workflow**:
  1. Seller taps an `AVAILABLE` ticket.
  2. Backend atomically reserves the ticket for 5 minutes and generates a unique booking QR code.
  3. Customer scans the QR code on the seller's phone and submits their **Full Name** and **Mobile Number** (no customer account required).
  4. Seller records payment (`Cash` or `UPI`) and confirms the sale.
  5. System generates a high-resolution downloadable **JPG Digital Ticket** with a cryptographic verification QR token (no sensitive PII or phone number is exposed inside the QR payload).

### Concurrency & Duplicate Prevention
- Uses PostgreSQL transactions (`BEGIN ... COMMIT`) with row-level locking (`SELECT ... FOR UPDATE`) and conditional atomic updates.
- If Seller A and Seller B simultaneously select the same ticket (`001`), only one succeeds (`HTTP 200`), and the second receives `HTTP 409`:
  `"This ticket has already been reserved by another seller. Please select another ticket."`
- Expired reservations are automatically released back to `AVAILABLE`.

---

## 2. Technology Stack

- **Frontend**: React 18, Vite, React Router v6, Lucide Icons, Responsive CSS
- **Backend**: Node.js, Express.js, REST APIs
- **Database**: Supabase PostgreSQL (`pg`) + Embedded persistent PostgreSQL (`@electric-sql/pglite` for instant zero-config local development)
- **Security & Utilities**:
  - `jsonwebtoken` (JWT authentication)
  - `bcryptjs` (Password hashing)
  - `express-validator` (Backend input validation)
  - `express-rate-limit` (Brute-force & API rate limiting)
  - `qrcode` & `sharp` (QR code & high-resolution JPG digital ticket generation)
  - `xlsx` (Excel `.xlsx` and `.csv` report exports)

---

## 3. Project Folder Structure

```text
/lucky_draw
  /frontend
    /src
      /assets
        ticketTheme.js
      /components
        DigitalTicketCard.jsx
        ProtectedRoute.jsx
        QrReservationModal.jsx
        TicketGrid.jsx
      /layouts
        AppLayout.jsx
      /pages
        AdminDashboard.jsx
        CustomerBookingPage.jsx
        LoginPage.jsx
        SellerDashboard.jsx
        VerifyTicketPage.jsx
      /services
        api.js
      App.jsx
      index.css
      main.jsx
    index.html
    package.json
    vercel.json
    vite.config.js
  /backend
    /config
      db.js
    /controllers
      adminController.js
      authController.js
      bookingController.js
      sellerController.js
    /database
      /migrations
        001_initial_schema.sql
      initDb.js
      migrate.js
      schema.sql
      seed.js
    /middleware
      auth.js
      validate.js
    /routes
      adminRoutes.js
      authRoutes.js
      publicRoutes.js
      sellerRoutes.js
      ticketRoutes.js
    /services
      activityLogger.js
      reservationCleaner.js
      ticketGeneratorService.js
    /tests
      concurrency.test.js
    /utils
      ticketDesignConfig.js
      ticketFormatter.js
    .env.example
    package.json
    server.js
  README.md
```

---

## 4. Database Setup (Supabase PostgreSQL or Local PostgreSQL)

### Option A: Zero-Config Local Mode (Default for Immediate Testing)
By default, `backend/.env` has `DATABASE_URL=local`, which uses an embedded persistent PostgreSQL engine stored in `backend/database/pgdata`. No external database installation is required to test locally.

### Option B: Connect to Supabase PostgreSQL
1. Go to [https://supabase.com](https://supabase.com) and create a new project.
2. In your Supabase project dashboard, open **Project Settings -> Database**.
3. Copy the **Connection String (URI)** (Session pooler or Direct connection) and replace `[YOUR-PASSWORD]` with your database password.
4. Paste it into `backend/.env` as `DATABASE_URL`:
   ```env
   DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
   DATABASE_SSL=true
   ```
5. Run the migration and seed command inside `/backend`:
   ```bash
   cd backend
   npm run seed
   ```
   *(Alternatively, you can copy and run the contents of `backend/database/schema.sql` directly inside the Supabase SQL Editor).*

---

## 5. Environment Variable Configuration

### Backend (`backend/.env`)
```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
DATABASE_URL=local
DATABASE_SSL=false
JWT_SECRET=lucky_draw_secure_jwt_secret_key_2026_production_ready
JWT_EXPIRES_IN=24h
RESERVATION_EXPIRY_MINUTES=5
DEFAULT_TICKET_PRICE=50
DEFAULT_TOTAL_TICKETS=200
```

### Frontend (`frontend/.env`)
```env
# Leave empty during local development (Vite proxies /api to http://localhost:5000)
# Set to your Render backend URL in production (e.g. https://lucky-draw-backend.onrender.com)
VITE_API_BASE_URL=
```

---

## 6. Installation & Running the Application in VS Code

Open **two terminal tabs** in VS Code:

### Terminal 1: Start the Backend Server
```bash
cd backend
npm install
npm run seed
npm start
```
The backend API will start at **`http://localhost:5000`**.

### Terminal 2: Start the React Frontend
```bash
cd frontend
npm install
npm run dev
```
The frontend web app will start at **`http://localhost:5173`**.

---

## 7. Default Login Credentials (Admin & 50 Sellers)

When the database initializes (`npm run seed` or first server start), it automatically creates:

| Role | Username | Password | Notes |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin` | `Admin@123` | Full system access |
| **Seller 01 (Reenal)** | `seller01` | `Seller@123` | Seller Code `SLR-001` |
| **Seller 02** | `seller02` | `Seller@123` | Seller Code `SLR-002` |
| **Seller 03 .. Seller 50** | `seller03` .. `seller50` | `Seller@123` | Seller Codes `SLR-003` .. `SLR-050` |

### How to Create / Reset Seller Accounts
- Log in as **Admin** (`admin` / `Admin@123`).
- Click the **Manage 50 Sellers** tab.
- Click **Add Seller Account** to add a new seller, **Verify / Ensure 50 Sellers** to ensure all 50 accounts exist, or use the action buttons on any seller row to **Edit**, **Reset Password**, or **Activate/Deactivate**.

---

## 8. How to Test Ticket Reservations & Concurrency Protection

### Automated Concurrency & End-to-End Test Suite
Run the built-in test suite to verify admin login, seller login, role protection, **simultaneous reservation of Ticket #001 by Seller A and Seller B**, customer QR booking, JPG ticket generation, expiry release, and Excel/CSV export:
```bash
cd backend
npm test
```

### Manual Browser Walkthrough
1. Open `http://localhost:5173` and log in as **Seller 01 (Reenal)** (`seller01` / `Seller@123`).
2. Tap any green **AVAILABLE** ticket (e.g., `#001`).
3. A modal opens displaying the **Customer Booking QR Code** and a 5-minute countdown.
4. Click **Open Customer Page** (or scan the QR code with a mobile phone on the same network).
5. Enter Customer Full Name and 10-digit Mobile Number and submit.
6. Return to the Seller tab — it automatically shows `✓ Customer Form Received!`.
7. Choose **Cash** or **UPI** and click **Confirm Payment Received & Issue Ticket**.
8. Both the Seller modal and the Customer booking page immediately display the confirmed **Digital Ticket** with the **Download JPG Ticket** button.

---

## 9. Customizing the Digital Ticket Design Later

When you have the final event logo, colors, and branding:
- Edit [backend/utils/ticketDesignConfig.js](file:///c:/Users/renes/Downloads/Desktop/lucky_draw/backend/utils/ticketDesignConfig.js) and [backend/services/ticketGeneratorService.js](file:///c:/Users/renes/Downloads/Desktop/lucky_draw/backend/services/ticketGeneratorService.js) to update the JPG ticket layout and colors without touching any other part of the application.

---

## 10. Deployment Instructions (Supabase + Render + Vercel)

### Step 1: Database on Supabase
1. Create a Supabase project and copy the PostgreSQL URI connection string.
2. Run `backend/database/schema.sql` in the Supabase SQL Editor (or run `npm run seed` locally with `DATABASE_URL` pointing to Supabase).

### Step 2: Backend on Render
1. Push this repository to GitHub.
2. Create a new **Web Service** on [Render](https://render.com) connected to your GitHub repo.
3. Configure settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add Environment Variables on Render:
   - `DATABASE_URL`: Your Supabase PostgreSQL URI
   - `DATABASE_SSL`: `true`
   - `JWT_SECRET`: A strong random secret string
   - `FRONTEND_URL`: Your Vercel frontend URL (e.g., `https://your-lucky-draw.vercel.app`)

### Step 3: Frontend on Vercel
1. Import the same GitHub repository into [Vercel](https://vercel.com).
2. Configure settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add Environment Variable on Vercel:
   - `VITE_API_BASE_URL`: Your Render backend URL (e.g., `https://lucky-draw-backend.onrender.com`)
4. Deploy!

