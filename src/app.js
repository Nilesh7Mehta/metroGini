import express from 'express';
import cors from 'cors';
import newUserRouter from './routes/user.router.js';

const app = express();
app.use(express.json());
app.use(cors());


app.use('/api/user', newUserRouter);

app.get('/', (req, res) => {
  res.send('Hello, World!');
}); 

//global error handler next(error) must be last
app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
});


export default app;