# Taptode Backend 🚀

A powerful referral and WhatsApp-based marketing automation platform built with Node.js, Express, and MongoDB.


## ✨ Key Features

- **Dual Role System**: Separate interfaces for Referrers and Marketers
- **WhatsApp Integration**: Seamless connectivity via QR code scanning
- **Reward Ecosystem**: Comprehensive package purchase and reward management
- **Automation**: Intelligent group number extraction and inbox message automation
- **SMS Integration**: External API connectivity with smspro.pk for OTP verification and messaging
- **Scheduled Tasks**: Support for cron jobs to handle recurring operations

## 🛠️ Tech Stack

- **Backend**: Node.js & Express.js
- **Database**: MongoDB
- **Authentication**: JWT-based secure auth system
- **Communication**: WhatsApp API & SMS Gateway
- **Scheduling**: Node-cron for task automation

## 📋 Prerequisites

- Node.js (v16+)
- MongoDB (v4.4+)
- smspro.pk API credentials
- ngrok (for local WhatsApp webhook development)

## 🚀 Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/naumanyousaf026/taptode-backend.git

# Navigate to project directory
cd taptode-backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start the development server
npm run dev
```

### Environment Configuration

Create a `.env` file with the following variables:

```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/taptode
JWT_SECRET=your_jwt_secret_key
SMS_API_KEY=your_smspro_api_key
WHATSAPP_API_URL=https://api.smspro.pk/whatsapp
```

## 📊 API Documentation

### Authentication Endpoints (`/api/auth`)
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-otp` - Verify OTP during registration/login

### Money & Withdrawal Management (`/api/money`)
- `POST /api/money/withdraw` - Request a withdrawal
- `GET /api/money/transactions` - View transaction history
- `GET /api/money/balance` - Get current balance

### WhatsApp Services (`/api`)
- `POST /api/send` - Send WhatsApp message
- `GET /api/groups` - Get user  WhatsApp groups 
- `POST /api/numbers` - Extract numbers from groups

### Admin Routes (`/api/admin`)
- `GET /api/admin/users` - Get all users
- `POST /api/admin/approve-withdrawal` - Approve withdrawal request
- `PUT /api/admin/update-user` - Update user information

### Package Management (`/api`)
- `GET /api/packages` - Get all available packages
- `POST /api/packages/purchase` - Purchase a package
- `GET /api/packages/history` - Get purchase history

### Subscription Management (`/api`)
- `GET /api/subscriptions` - Get user subscriptions
- `POST /api/subscriptions/new` - Create new subscription
- `PUT /api/subscriptions/:id` - Update subscription
- `DELETE /api/subscriptions/:id` - Cancel subscription

### Admin WhatsApp Management (`/api/whatsapp`)
- `GET /api/whatsapp/qr` - Generate WhatsApp connection QR
- `POST /api/whatsapp/info` - Webhook for WhatsApp events
- `GET /api/whatsapp/status` - Check WhatsApp connection status

## 🔒 Security

- JWT-based authentication
- Input validation using Joi/Express-validator
- Rate limiting to prevent abuse
- XSS protection

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


## 📞 Contact

Nauman Yousaf - [GitHub](https://github.com/naumanyousaf026)

---

Made with ❤️ by the Taptode Team