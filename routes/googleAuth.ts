import express from "express";
import { Request, Response, Router } from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import User from "../models/user";
import 'dotenv/config';

const router: Router = express.Router();

const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
if (!googleClientId) {
  throw new Error("GOOGLE_CLIENT_ID is not defined in the environment variables.");
}

const client = new OAuth2Client(googleClientId);

router.post('/google', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    
    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_OAUTH_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    if (!payload) {
      res.status(400).json({ success: false, message: 'Invalid token' });
      return;
    }
    
    const { email, name, picture } = payload;
    
    // Check if user exists
    let user = await User.findOne({ email });
    
    if (!user) {
      // Create new user if doesn't exist
      user = new User({
        email,
        name,
        profilePicture: picture,
        authProvider: 'google'
      });
      await user.save();
    }
    
    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is not defined in the environment variables.");
    }
    
    const authToken = jwt.sign(
      { userId: user._id },
      jwtSecret,
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
        },
        token: authToken
      }
    });
    
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
});

export default router;