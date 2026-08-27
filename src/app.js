import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import newUserRouter from './routes/users/user.router.js';
import userNotificationRoute from './routes/users/userNotification.router.js';
import newCommonRouter from './routes/common.router.js';
import userOrderRouter from './routes/users/userOrder.router.js';
import newAdminRouter from './routes/admin/admin.router.js';
import newUserPaymentRouter from './routes/users/userPayment.router.js'
import newRiderRouter from './routes/rider/rider.router.js';
import riderOrderRoute from './routes/rider/riderOrder.router.js';
import newVendorRoute from './routes/vendor/vendor.router.js';
import newVendorOrderRoute from './routes/vendor/vendorOrder.router.js';
import vendorNotificationRoute from './routes/vendor/vendorNotification.router.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { apiLogger, logApiError } from './middleware/apiLogger.middleware.js';
import { startPickupCron } from "./cron/pickupCron.js";
import "./cron/vendorDeadlineCron.js";
import "./cron/deliveryRescheduleCron.js";
import { AssignOrderToRider } from './cron/orderSplitCron.js';
startPickupCron();
AssignOrderToRider();
const app = express();
const jsonParser = express.json();

app.use(
  '/api/user/order/payment/razorpay/webhook',
  express.raw({ type: 'application/json' }),
);
app.use((req, res, next) => {
  if (req.originalUrl.includes('/razorpay/webhook')) {
    return next();
  }
  jsonParser(req, res, next);
});
app.use(
  cors({
    origin: "*",
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Access-Control-Allow-Origin",
    ],
  }),
);
app.set('trust proxy', 1); // trust first proxy for rate limiting and secure cookies
// app.use(cors());
// app.use(
//   cors({
//     origin: allowedOrigins,
//     credentials: true,
//   })
// );
app.use(apiLogger);
app.use(morgan("dev"));
app.use('/api' , apiLimiter);

/** Force file download when ?download=1 is present on upload URLs. */
const forceUploadDownload = (req, res, next) => {
  if (String(req.query.download || '') !== '1') return next();
  const rel = String(req.path || '').replace(/^\/+/, '');
  const abs = path.join(process.cwd(), 'uploads', rel);
  if (!abs.startsWith(path.join(process.cwd(), 'uploads')) || !fs.existsSync(abs)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }
  return res.download(abs, path.basename(abs));
};

app.use('/uploads', forceUploadDownload);
app.use('/api/uploads', forceUploadDownload);
app.use('/uploads', express.static('uploads'));
// Frontend often prefixes API base → /api/uploads/...
app.use('/api/uploads', express.static('uploads'));

app.use('/api/user/notifications', userNotificationRoute);
app.use('/api/user', newUserRouter);
app.use('/api/common', newCommonRouter);
// Payment routes must be registered before /api/user/order — that router applies auth to all /api/user/order/* paths
app.use('/api/user/order/payment', newUserPaymentRouter);
app.use('/api/user/order', userOrderRouter);
app.use('/api/admin', newAdminRouter);
app.use('/api/rider' , newRiderRouter);
app.use('/api/rider/order' , riderOrderRoute);
app.use('/api/vendor' , newVendorRoute);
app.use('/api/vendor/order' , newVendorOrderRoute);
app.use('/api/vendor/notifications', vendorNotificationRoute);

app.get('/', (req, res) => {
  res.send('Hello, World!');
}); 

//global error handler next(error) must be last
app.use((err, req, res, next) => {
  console.error(err);
  logApiError(err, req);

  res.status(err.status || 500).json({
    code: err.status || 500,
    success: false,
    message: err.message || "Internal Server Error",
  });
});


export default app;