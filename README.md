# 📊 Dashboard Ruang Kerja Kolaborasi

Sistem kolaborasi modern untuk manajemen karyawan dengan fitur real-time, KPI tracking, dan komunikasi tim.

## 🎯 Fitur Utama

### 1. **Authentication & Security**
- ✅ Login dengan email & password
- ✅ Two-Factor Authentication (2FA) menggunakan Google Authenticator/Authy
- ✅ Remember Me (30 hari)
- ✅ Role-based Access Control (Super Admin, Pengurus, SDM, Karyawan)

### 2. **Manajemen Jobdesk**
- ✅ Create, Read, Update, Delete jobdesk
- ✅ Assign jobdesk ke multiple karyawan sekaligus
- ✅ Status tracking (Pending, In Progress, Completed)
- ✅ Pop-up wajib input jobdesk untuk karyawan baru
- ✅ Notifikasi real-time saat dapat jobdesk baru

### 3. **Daily Log & KPI**
- ✅ Input daily work log dengan notes & hours spent
- ✅ KPI calculation otomatis berdasarkan:
  - Jobdesk completion rate
  - Total hours worked
  - Daily activity logs
- ✅ Custom formula: `(completed/total * 50) + (logs * 2) + (hours * 0.5)`
- ✅ Filter per bulan atau custom date range
- ✅ Visualisasi dengan charts (Bar chart & Pie chart)

### 4. **Manajemen Divisi**
- ✅ CRUD divisi
- ✅ Assign karyawan ke divisi
- ✅ View anggota per divisi
- ✅ Grouping untuk memudahkan manajemen

### 5. **Group Chat Real-time**
- ✅ Real-time messaging menggunakan Socket.io
- ✅ Multiple chat rooms
- ✅ Online/offline status
- ✅ Message history
- ✅ Typing indicators

### 6. **To-Do List**
- ✅ Personal task management
- ✅ Priority levels (High, Medium, Low)
- ✅ Due date tracking
- ✅ Mark as complete/incomplete

### 7. **Notifikasi Real-time**
- ✅ In-app notifications
- ✅ Socket.io untuk real-time updates
- ✅ Notification bell dengan unread count
- ✅ Mark as read functionality

## 🏗️ Teknologi Stack

### Frontend
- **Next.js 14** - React framework dengan App Router
- **React 18** - UI library
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Beautiful component library
- **Lucide React** - Icon library
- **Recharts** - Chart visualization
- **Socket.io Client** - Real-time communication
- **Sonner** - Toast notifications

### Backend
- **Next.js API Routes** - Backend API
- **Node.js Custom Server** - Socket.io integration
- **MongoDB** - NoSQL database
- **Socket.io** - Real-time bidirectional communication

### Security & Authentication
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT authentication
- **speakeasy** - 2FA TOTP implementation
- **qrcode** - QR code generation untuk 2FA

## 📁 Struktur Project

```
/app
├── app/
│   ├── api/[[...path]]/route.js   # Backend API endpoints
│   ├── page.js                     # Login page
│   ├── layout.js                   # Root layout
│   └── globals.css                 # Global styles
├── components/
│   ├── DashboardApp.jsx            # Main dashboard
│   ├── pages/                      # Page components
│   │   ├── DashboardHome.jsx       # Dashboard home
│   │   ├── JobdeskPage.jsx         # Jobdesk management
│   │   ├── KPIPage.jsx             # KPI dashboard
│   │   ├── DivisionPage.jsx        # Division management
│   │   ├── ChatPage.jsx            # Real-time chat
│   │   ├── TodoPage.jsx            # To-do list
│   │   └── SettingsPage.jsx        # User settings
│   └── ui/                         # shadcn components
├── lib/
│   ├── mongodb.js                  # MongoDB connection
│   ├── api.js                      # API helper functions
│   ├── socket-client.js            # Socket.io client
│   └── utils.js                    # Utility functions
├── scripts/
│   └── seed.js                     # Database seeding
├── server.js                       # Custom server dengan Socket.io
├── .env                            # Environment variables
└── package.json                    # Dependencies
```

## 🚀 Setup & Installation

### 1. Prerequisites
- Node.js 18+ 
- MongoDB
- Yarn package manager

### 2. Environment Variables
File `.env` sudah di-configure dengan:
```env
MONGO_URL=mongodb://localhost:27017/workspace_collaboration
NEXT_PUBLIC_BASE_URL=http://localhost:3000
JWT_SECRET=your-super-secret-jwt-key-change-in-production-12345
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
```

### 3. Install Dependencies
```bash
cd /app
yarn install
```

### 4. Seed Database (Data Sample)
```bash
yarn seed
```

Database akan diisi dengan sample data:
- 3 Divisi (IT & Technology, Marketing, Human Resources)
- 6 Users (1 Super Admin, 1 Pengurus, 1 SDM, 3 Karyawan)
- 3 Jobdesks dengan berbagai status
- Sample daily logs
- 1 Chat room dengan messages

### 5. Start Development Server
```bash
yarn dev
```

Server akan berjalan di `http://localhost:3000`

## 👥 Sample Login Credentials

Setelah menjalankan `yarn seed`, gunakan credentials berikut untuk login:

### Super Admin
- **Email:** admin@workspace.com
- **Password:** password123
- **Akses:** Full access ke semua fitur

### Pengurus
- **Email:** pengurus@workspace.com
- **Password:** password123
- **Akses:** Assign jobdesk, manage divisi, view KPI semua karyawan

### SDM
- **Email:** sdm@workspace.com
- **Password:** password123
- **Akses:** View KPI semua karyawan, manage divisi

### Karyawan
- **Email:** karyawan1@workspace.com
- **Password:** password123
- **Akses:** Manage own jobdesk, daily logs, chat, to-do list

## 🔐 Two-Factor Authentication (2FA)

### Setup 2FA:
1. Login ke aplikasi
2. Buka halaman **Pengaturan** (Settings)
3. Klik **Aktifkan 2FA**
4. Scan QR Code dengan Google Authenticator atau Authy
5. Masukkan 6-digit code untuk verifikasi
6. 2FA aktif! Next login akan meminta kode 2FA

### Disable 2FA:
Fitur disable 2FA dapat ditambahkan di pengaturan (currently not implemented in MVP)

## 📊 KPI Calculation Formula

KPI Score dihitung menggunakan formula custom:

```
KPI Score = (completed/total × 50) + (total_logs × 2) + (total_hours × 0.5)

Maximum Score: 100
```

**Komponen:**
- **Completion Rate (50%)**: Persentase jobdesk yang diselesaikan
- **Activity Score**: Jumlah daily logs × 2
- **Hours Score**: Total jam kerja × 0.5

**Contoh:**
- 8 dari 10 jobdesk completed: `(8/10 × 50) = 40`
- 15 daily logs: `15 × 2 = 30`
- 60 jam kerja: `60 × 0.5 = 30`
- **Total KPI Score: 100** ✅

## 🎨 Design System

### Color Theme (Modern Blue)
- **Primary**: Blue-600 (#2563eb)
- **Secondary**: Gray-100-800
- **Success**: Green-600
- **Warning**: Yellow-600
- **Error**: Red-600
- **Info**: Purple-600

### Role Badge Colors
- **Super Admin**: Purple
- **Pengurus**: Blue
- **SDM**: Green
- **Karyawan**: Gray

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/register` - Register user baru
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `GET /api/auth/2fa/qrcode` - Get 2FA QR code
- `POST /api/auth/2fa/enable` - Enable 2FA

### Jobdesk
- `GET /api/jobdesks` - Get all jobdesks
- `POST /api/jobdesks` - Create jobdesk
- `PUT /api/jobdesks/:id/status` - Update status

### Daily Logs
- `GET /api/daily-logs` - Get daily logs
- `POST /api/daily-logs` - Create daily log

### KPI
- `GET /api/kpi` - Get KPI data

### Divisions
- `GET /api/divisions` - Get all divisions
- `POST /api/divisions` - Create division

### Chat
- `GET /api/chat/rooms` - Get chat rooms
- `POST /api/chat/rooms` - Create chat room
- `GET /api/chat/rooms/:id/messages` - Get messages
- `POST /api/chat/messages` - Send message

### Todo
- `GET /api/todos` - Get todos
- `POST /api/todos` - Create todo
- `PUT /api/todos/:id` - Update todo

### Notifications
- `GET /api/notifications` - Get notifications
- `PUT /api/notifications/:id/read` - Mark as read

## 🔌 Socket.io Events

### Client → Server
- `join_room(roomId)` - Join chat room
- `leave_room(roomId)` - Leave chat room
- `send_message(data)` - Send message
- `typing(data)` - Typing indicator

### Server → Client
- `notification` - Receive notification
- `new_message` - Receive new message
- `user_typing` - User is typing

## 📱 Responsive Design

Aplikasi fully responsive dengan:
- **Desktop** (≥1024px): Full navigation, side-by-side layouts
- **Tablet** (768px-1023px): Collapsed navigation, stacked layouts
- **Mobile** (<768px): Bottom navigation, single column

## 🔒 Security Features

1. **Password Hashing**: bcryptjs dengan salt rounds 10
2. **JWT Tokens**: Signed dengan secret key
3. **2FA**: TOTP implementation dengan speakeasy
4. **Role-based Access**: Middleware untuk authorization
5. **Socket Authentication**: JWT verification untuk Socket.io

## 🚀 Production Deployment

### Environment Variables untuk Production:
```env
MONGO_URL=mongodb+srv://user:pass@cluster.mongodb.net/workspace
NEXT_PUBLIC_BASE_URL=https://your-domain.com
JWT_SECRET=generate-strong-secret-key-here
NEXT_PUBLIC_SOCKET_URL=https://your-domain.com
```

### Build & Start:
```bash
yarn build
yarn start
```

## 📝 TODO / Future Enhancements

- [ ] Export KPI reports (PDF/Excel)
- [ ] Email notifications
- [ ] Reset password via email
- [ ] Profile picture upload
- [ ] File attachment di chat
- [ ] Advanced filters di KPI
- [ ] Dashboard analytics untuk Super Admin
- [ ] Mobile app (React Native)

## 🤝 Contributing

Aplikasi ini dibuat sebagai MVP (Minimum Viable Product). Untuk development lebih lanjut:

1. Fork repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📄 License

MIT License - Feel free to use this project for your needs!

## 🐛 Known Issues

- Socket.io might need reconnection handling on network changes
- Large file uploads not supported yet
- Browser notification (Web Push API) not implemented

## 💡 Tips & Tricks

1. **Untuk testing 2FA**: Gunakan Google Authenticator di smartphone
2. **KPI optimal**: Input daily logs secara rutin untuk KPI yang lebih akurat
3. **Chat performance**: Limit messages ke 50 per load untuk performance
4. **Database**: Index pada `userId`, `createdAt` untuk query performance

---

**Built with ❤️ using Next.js, MongoDB, and Socket.io**

Untuk pertanyaan atau support, silakan buka issue di repository.
