import express, { Request, Response } from 'express';
import OpenAI from 'openai';
import GeneratedBlog from '../models/GeneratedBlog';
import { CreditManager } from '../utils/creditManager';

const router = express.Router();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, 
});

// Fixed POST route with proper middleware typing
router.post('/generate-blog', CreditManager.handleCredits('code-generator'), async (req: Request, res: Response) => {
    const { topic, tone, length } = req.body;

    if (!topic || !tone || !length) {
        res.status(400).json({ message: 'All fields are required.' });
        return;
    }

    try {
        const prompt = `Write a ${length} blog post on the topic "${topic}" in a ${tone} tone.`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: 'You are a helpful assistant that writes blog posts.' },
                { role: 'user', content: prompt },
            ],
            max_tokens: length === 'short' ? 300 : length === 'medium' ? 600 : 1000,
        });

        const content = response.choices[0]?.message?.content || '';
        const excerpt = content.split('.').slice(0, 2).join('.') + '.';

        const generatedBlog = {
            topic,
            tone,
            length,
            title: `Blog on ${topic}`,
            content: content.trim(),
            excerpt,
            tags: ['AI', 'blog', topic],
        };

        const blog = new GeneratedBlog(generatedBlog);
        await blog.save();
        const creditInfo = res.locals.creditInfo;

        res.status(201).json({
            ...generatedBlog,
            creditInfo: {
                ...creditInfo,
                remainingCredits: creditInfo.remainingCredits // Make sure this is included
            }
        });
    } catch (error: any) {
        console.error('Error generating blog:', error.message);
        res.status(500).json({ message: 'Failed to generate blog content.' });
    }
});

export default router;