import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import connectDB from './config/database';
import authRoutes from './routes/auth';
import newsletterRoutes from './routes/newsletter'; // Adjust the path to your newsletter route file
import blogGeneratorRoutes from './routes/blogGenerator'; // Adjust the path to your blog generator route file
import testRoute from './routes/testRoute';
import googleAuthRoutes from './routes/googleAuth';
import seoRouter from './routes/seoRoute';
import youtubeSummarizerRoutes from './routes/ytTool'; // Import the new YouTube summarizer route
import generateBlogPost from './routes/bla'; // Import the new blog generation route


const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000', // Adjust for your frontend
    credentials: true,
  })
);
app.use(morgan('combined'));
app.use(express.json());

// Routes
app.use('/api/blogs', generateBlogPost); // Adjust the path to your blog generation route
app.use('/api', seoRouter);
app.use('/api/auth', googleAuthRoutes);
app.use('/api', testRoute);
app.use('/api/auth', authRoutes); // Authentication routes
app.use('/api/newsletter', newsletterRoutes); // Newsletter subscription routes
app.use('/api', blogGeneratorRoutes); // Blog generator routes
app.use('/api', youtubeSummarizerRoutes); // YouTube summarizer routes

// Global error handler
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(error);
  res.status(500).json({ message: 'Something went wrong' });
});

// Connect to database and start the server
const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to connect to database:', error);
  });

export default app;