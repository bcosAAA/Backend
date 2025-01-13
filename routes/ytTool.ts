import express, { Request, Response } from 'express';
import { YoutubeTranscript } from 'youtube-transcript';
import OpenAI from 'openai';
import axios, { AxiosError } from 'axios';
import { CreditManager } from '../utils/creditManager';

const router = express.Router();
const ELEVEN_LABS_API_KEY = "sk_996a5110a3efd9267efe056167db5ee285a6499ce7b11fdd";

router.post('/summarize', CreditManager.handleCredits('ytSummarizer'), async (req: Request, res: Response): Promise<void> => {
    const { url, language } = req.body;

    if (!url) {
        res.status(400).json({ error: 'URL is required' });
        return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
        res.status(400).json({ error: 'Invalid URL' });
        return;
    }

    try {
        const transcript = await fetchYouTubeTranscript(videoId);
        if (!transcript) {
            res.status(404).json({ error: 'Transcript not found' });
            return;
        }

        const summary = await handleLongFormContent(transcript, language);
        if (!summary) {
            res.status(500).json({ error: 'Failed to generate summary' });
            return;
        }

        // Get credit info from response locals
        const creditInfo = res.locals.creditInfo;
        
        res.json({ 
            summary,
            creditInfo: {
                ...creditInfo,
                remainingCredits: creditInfo.remainingCredits // Make sure this is included
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'An error occurred while processing your request' });
    }
});
interface ElevenLabsError {
    detail?: {
        message?: string;
    };
    message?: string;
}

if (!ELEVEN_LABS_API_KEY) {
    throw new Error('ELEVEN_LABS_API_KEY is not defined in environment variables');
}

router.post('/text-to-speech', async (req: Request, res: Response): Promise<void> => {
    const { text, voice_id = '21m00Tcm4TlvDq8ikWAM' } = req.body;

    if (!text) {
        res.status(400).json({ error: 'Text is required' });
        return;
    }

    try {
        const chunks = splitTextIntoChunks(text);
        const audioChunks: Buffer[] = [];

        for (const chunk of chunks) {
            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
                {
                    text: chunk,
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.5,
                    },
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'xi-api-key': ELEVEN_LABS_API_KEY,
                    },
                    responseType: 'arraybuffer',
                }
            );

            if (response.data) {
                audioChunks.push(Buffer.from(response.data as ArrayBuffer));
            }

            // Add a small delay between requests
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        if (audioChunks.length === 0) {
            throw new Error('No audio data generated');
        }

        const combinedAudio = Buffer.concat(audioChunks);
        res.set('Content-Type', 'audio/mpeg');
        res.send(combinedAudio);

    } catch (error) {
        console.error('Error converting text to speech:', error);
        let errorMessage = 'An error occurred while processing your request';

        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<ElevenLabsError>;
            if (axiosError.response?.data) {
                try {
                    if (typeof axiosError.response.data === 'string') {
                        const parsedError = JSON.parse(axiosError.response.data);
                        errorMessage = parsedError.detail?.message || 
                                     parsedError.message || 
                                     errorMessage;
                    } else if (typeof axiosError.response.data === 'object') {
                        const errorData = axiosError.response.data;
                        errorMessage = errorData.detail?.message || 
                                     errorData.message || 
                                     errorMessage;
                    }
                } catch {
                    errorMessage = 'Error processing audio generation response';
                }
            }
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }

        res.status(500).json({ error: errorMessage });
    }
});

function splitTextIntoChunks(text: string, maxChunkSize: number = 2000): string[] {
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentLength = 0;

    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    for (const sentence of sentences) {
        if (currentLength + sentence.length > maxChunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.join(''));
            currentChunk = [];
            currentLength = 0;
        }

        currentChunk.push(sentence);
        currentLength += sentence.length;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(''));
    }

    return chunks.map(chunk => chunk.trim()).filter(chunk => chunk.length > 0);
}

function splitIntoChunks(text: string, chunkSize: number = 4000): string[] {
    const words = text.split(' ');
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentLength = 0;

    for (const word of words) {
        if (currentLength + word.length + 1 <= chunkSize) {
            currentChunk.push(word);
            currentLength += word.length + 1;
        } else {
            chunks.push(currentChunk.join(' '));
            currentChunk = [word];
            currentLength = word.length;
        }
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
    }

    return chunks;
}

async function handleLongFormContent(text: string, language: string): Promise<{ mainPoints: string[], keyTakeaways: string[], conclusion: string } | null> {
    try {
        const chunks = splitIntoChunks(text);
        const summaries = await Promise.all(
            chunks.map(chunk => summarizeWithOpenAI(chunk, language))
        );

        const validSummaries = summaries.filter(summary => summary !== null) as { mainPoints: string[], keyTakeaways: string[], conclusion: string }[];
        
        if (validSummaries.length === 0) {
            return null;
        }

        if (validSummaries.length === 1) {
            return validSummaries[0];
        }

        // Combine and create a final summary
        const combinedMainPoints = validSummaries.flatMap(summary => summary.mainPoints);
        const combinedKeyTakeaways = validSummaries.flatMap(summary => summary.keyTakeaways);
        const combinedConclusion = validSummaries.map(summary => summary.conclusion).join('\n');

        return {
            mainPoints: combinedMainPoints,
            keyTakeaways: combinedKeyTakeaways,
            conclusion: combinedConclusion,
        };
    } catch (error) {
        console.error('Error handling long form content:', error);
        return null;
    }
}

function extractVideoId(url: string): string | null {
    const patterns = [
        /v=([a-zA-Z0-9_-]{11})/,
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /embed\/([a-zA-Z0-9_-]{11})/,
        /\?v=([a-zA-Z0-9_-]{11})/,
        /\/v\/([a-zA-Z0-9_-]{11})/,
        /\/vi\/([a-zA-Z0-9_-]{11})/,
        /\/e\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }

    return null;
}

async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        return transcript.map((entry: { text: string }) => entry.text).join(' ');
    } catch (error) {
        console.error('Error fetching YouTube transcript:', error);
        return null;
    }
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function summarizeWithOpenAI(
    text: string, 
    language: string = 'english',
    customInstruction: string = 'Summarize the following YouTube video content'
): Promise<{ mainPoints: string[], keyTakeaways: string[], conclusion: string } | null> {
    try {
        const prompt = `${customInstruction} in ${language}. The summary should be structured into sections like 'Main Points,' 'Key Takeaways,' and 'Conclusion':\n\n${text}\n\nSummary:`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that creates structured summaries for YouTube video content.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 0.7,
        });

        // Parse the response into a structured object
        const rawSummary = response.choices[0]?.message?.content?.trim() || null;
        if (rawSummary) {
            // Extract sections from the raw summary
            const mainPointsMatch = rawSummary.match(/Main Points:([\s\S]*?)Key Takeaways:/);
            const keyTakeawaysMatch = rawSummary.match(/Key Takeaways:([\s\S]*?)Conclusion:/);
            const conclusionMatch = rawSummary.match(/Conclusion:([\s\S]*)/);

            const mainPoints = mainPointsMatch ? mainPointsMatch[1].trim().split('\n').filter(line => line.trim()) : [];
            const keyTakeaways = keyTakeawaysMatch ? keyTakeawaysMatch[1].trim().split('\n').filter(line => line.trim()) : [];
            const conclusion = conclusionMatch ? conclusionMatch[1].trim() : '';

            return { mainPoints, keyTakeaways, conclusion };
        }
        return null;
    } catch (error) {
        console.error('Error summarizing with OpenAI:', error);
        return null;
    }
}

export default router;