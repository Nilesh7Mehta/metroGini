import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import newUserRouter from './routes/users/user.router.js';
import newCommonRouter from './routes/common.router.js';
import userOrderRouter from './routes/users/userOrder.router.js';
import newAdminRouter from './routes/admin/admin.router.js';
import newUserPaymentRouter from './routes/users/userPayment.router.js'
import newRiderRouter from './routes/rider/rider.router.js';
import { apiLimiter } from './middleware/rateLimiter.js';

const app = express();
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));
app.use('/api' , apiLimiter);

app.use('/api/user', newUserRouter);
app.use('/api/common', newCommonRouter);
app.use('/api/user/order', userOrderRouter);
app.use('/api/admin', newAdminRouter);
app.use('/api/user/order/payment' , newUserPaymentRouter);
app.use('/api/rider' , newRiderRouter);

app.get('/', (req, res) => {
  res.send('Hello, World!');
}); 

//global error handler next(error) must be last
app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
   
    code: 500,
    success: false,
    message: "Internal Server Error",
    error: err.code
  });
});


export default app;