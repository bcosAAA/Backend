import { Router, Request, Response } from 'express';
import NewsletterSubscriber from '../models/newsletterSubscriber';

const router = Router();

// POST: Add a subscriber
router.post('/subscribe', async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;

    if (!email) {
        res.status(400).json({ message: 'Email is required' });
        return;
    }

    try {
        const newSubscriber = new NewsletterSubscriber({ email });
        await newSubscriber.save();
        res.status(201).json({ message: 'Subscription successful!' });
    } catch (error: any) {
        if (error.code === 11000) {
            res.status(409).json({ message: 'This email is already subscribed.' });
            return;
        }
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// GET: Fetch all subscribers (optional, for admin use)
router.get('/subscribers', async (req: Request, res: Response): Promise<void> => {
    try {
        const subscribers = await NewsletterSubscriber.find();
        res.status(200).json(subscribers);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// Export router as default
export default router;
