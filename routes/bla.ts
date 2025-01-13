import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import AutomatedBlog from '../models/blog';
import slugify from 'slugify'; // Correct import
import OpenAI from 'openai';
import { createApi } from 'unsplash-js'; // Correct import
import jwt from 'jsonwebtoken'; // Add JWT for token verification

const router = express.Router();

// OpenAI configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Unsplash configuration
const unsplash = createApi({
  accessKey: process.env.UNSPLASH_ACCESS_KEY || '', // Provide a fallback value
});

// Add this interface for the JWT payload
interface JWTPayload {
  userId: string;
  // Add other fields that are in your token
}

// Helper function to parse the generated text into structured content
function parseGeneratedText(text: string) {
  const title = text.match(/Title: (.*)/)?.[1] || "Sample Generated Title";
  const content = text.match(/Content: (.*)/)?.[1] || "Sample generated content...";
  const metaTitle = text.match(/Meta Title: (.*)/)?.[1] || "Sample Meta Title";
  const metaDescription = text.match(/Meta Description: (.*)/)?.[1] || "Sample meta description for SEO purposes";
  const keywords = text.match(/Keywords: (.*)/)?.[1]?.split(',') || ["keyword1", "keyword2"];

  return {
    title,
    content,
    metaTitle,
    metaDescription,
    keywords,
  };
}

// Helper function to fetch an image from Unsplash
async function fetchImageForBlog(category: string, prompt: string): Promise<string> {
  try {
    const query = `${category} ${prompt}`;
    const result = await unsplash.photos.getRandom({ query });

    if (result.errors) {
      console.error('Unsplash error:', result.errors);
      return "/placeholder-image.jpg"; // Fallback image
    }

    // Handle both single and array responses
    const photo = Array.isArray(result.response) ? result.response[0] : result.response;
    const imageUrl = photo?.urls?.regular || "/placeholder-image.jpg";
    return imageUrl;
  } catch (error) {
    console.error('Error fetching image:', error);
    return "/placeholder-image.jpg"; // Fallback image
  }
}

// Generate blog route
router.post('/generate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, prompt } = req.body;

    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Verify and decode the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    const userId = decoded.userId;

    // Validate required fields
    if (!category || !prompt || !userId) {
      res.status(400).json({
        success: false,
        message: 'Category and prompt are required',
      });
      return;
    }

    // Generate SEO-optimized content using OpenAI (GPT-4)
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4", // Use GPT-4 or gpt-4o if available
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that generates SEO-optimized blog posts.",
        },
        {
          role: "user",
          content: `Write a detailed, SEO-optimized blog post about ${prompt} in the ${category} category. Include a title, meta title, meta description, and keywords.`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const generatedText = aiResponse.choices[0].message.content?.trim() || "";
    const generatedContent = parseGeneratedText(generatedText);

    // Fetch an image from Unsplash
    const imageUrl = await fetchImageForBlog(category, prompt);

    // Create a new blog post
    const newBlog = new AutomatedBlog({
      title: generatedContent.title,
      content: generatedContent.content,
      featuredImage: imageUrl,
      seoMetadata: {
        metaTitle: generatedContent.metaTitle,
        metaDescription: generatedContent.metaDescription,
        keywords: generatedContent.keywords,
      },
      externalLinks: [], // These could be generated based on content
      status: 'draft', // Always start as draft for review
      author: userId, // Use userId from the token
      category,
      slug: slugify(generatedContent.title, { lower: true }),
    });

    // Save the blog post to the database
    const savedBlog = await newBlog.save();

    res.status(201).json({
      success: true,
      message: 'Blog post generated successfully',
      data: savedBlog,
    });

  } catch (error) {
    console.error('Blog generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating blog post',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

// Export the router
export default router;