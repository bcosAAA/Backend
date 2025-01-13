import express, { Request, Response } from 'express';

const router = express.Router();

// Test endpoint

router.get('/test', async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({
    success: true,
    message: 'Backend is working correctly',
  });
});

export default router;
