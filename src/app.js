import express from 'express';
import cors from 'cors';
import newUserRouter from './routes/users/user.router.js';
import newUserDashboardRouter from './routes/Dashboard.router.js';
import userOrderRouter from './routes/users/userOrder.router.js';
import newAdminRouter from './routes/admin/admin.router.js';

const app = express();
app.use(express.json());
app.use(cors());


app.use('/api/user', newUserRouter);
app.use('/api/user/dashboard', newUserDashboardRouter);
app.use('/api/user/order', userOrderRouter);
app.use('/api/admin', newAdminRouter);

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