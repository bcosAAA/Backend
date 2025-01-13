  import express, { Request, Response } from 'express';
  import bcrypt from 'bcrypt';
  import jwt from 'jsonwebtoken';
  import { v4 as uuidv4 } from 'uuid';
  import User from '../models/user';
  import { rateLimiter, sanitizeInput } from '../middleware/auth';
  import { validateEmail, validatePassword } from '../utils/validation';
  import { IUser, RegisterRequest, LoginRequest } from '../types/user';
  import nodemailer from 'nodemailer';
  import validator from 'validator';
  import { randomInt } from 'crypto';

  const router = express.Router();
  const generateEmail = (verificationCode: string) => `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #f9f9f9; color: #333; }
      .email-container { max-width: 500px; margin: 40px auto; background: #ffffff; border: 1px solid #eaeaea; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1); overflow: hidden; }
      .email-header { background: #253B74; padding: 20px; text-align: center; color: white; }
      .email-body { padding: 30px; text-align: center; }
      .email-body h2 { color: #91BE3F; }
      .verification-code { font-size: 32px; font-weight: bold; color: #253B74; background: #f5f5f5; border: 1px solid #ddd; border-radius: 8px; padding: 15px 30px; margin: 20px auto; display: inline-block; }
      .note { font-size: 14px; color: #666; margin-top: 20px; }
      .email-footer { background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #777; }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="email-header">
        <h1>BCOS</h1>
      </div>
      <div class="email-body">
        <h2>Password Reset Verification</h2>
        <p>Hello,</p>
        <p>You requested a password reset. Use the code below to proceed:</p>
        <div class="verification-code">${verificationCode}</div>
        <p class="note">This code will expire in 15 minutes. If you did not request this, please ignore this email.</p>
        <p>Thank you,<br>BCOS Team</p>
      </div>
      <div class="email-footer">
        &copy; ${new Date().getFullYear()} BCOS. All rights reserved.
      </div>
    </div>
  </body>
  </html>
`;
  const transporter = nodemailer.createTransport({
    service: 'gmail', // Use your email provider (e.g., Gmail, Outlook)
    auth: {
      user: process.env.EMAIL_USER, // Your email address
      pass: process.env.EMAIL_PASSWORD, // Your email password or app-specific password
    },
  });
  interface JWTPayload {
    userId: string;
    email: string;
    role: string;
    iat?: number;
    exp?: number;
  }
  // Register endpoint
  router.post('/register', rateLimiter, sanitizeInput, async (req: Request<{}, {}, RegisterRequest>, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;
  
      console.log('Registering user:', email);
  
      if (!email || !password) {
        console.log('Email and password are required');
        res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
        return;
      }

      // Validate input
      if (!validateEmail(email) || !validatePassword(password)) {
        console.log('Invalid email or password format');
        res.status(400).json({
          success: false,
          message: 'Invalid email or password format',
        });
        return;
      }
  
      // Check if user exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        if (existingUser.authProvider === 'google') {
          console.log('Google-authenticated user found, updating to local auth:', email);
          existingUser.password = password; // The pre-save hook will hash the password
          existingUser.authProvider = 'local'; // Update the auth provider
          await existingUser.save();
  
          // Generate JWT token
          const token = jwt.sign(
            {
              userId: existingUser._id,
              email: existingUser.email,
              role: existingUser.role,
            },
            process.env.JWT_SECRET!,
            {
              expiresIn: '24h',
              algorithm: 'HS256',
            }
          );
  
          res.status(201).json({
            success: true,
            data: {
              token,
              user: {
                id: existingUser._id,
                email: existingUser.email,
                role: existingUser.role,
              },
            },
          });
        } else {
          console.log('Email already registered:', email);
          res.status(400).json({
            success: false,
            message: 'Email already registered',
          });
          return;
        }
      }
  
      // Create new user
      const user = new User({
        email,
        password,
        apiKey: uuidv4(),
        role: 'user',
        loginAttempts: {
          count: 0,
          lastAttempt: new Date(),
        },
      });
  
      await user.save();
      console.log('User registered successfully:', user);
  
      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user._id,
          email: user.email,
          role: user.role,
        },
        process.env.JWT_SECRET!,
        {
          expiresIn: '24h',
          algorithm: 'HS256',
        }
      );
  
      res.status(201).json({
        success: true,
        data: {
          token,
          user: {
            id: user._id,
            email: user.email,
            role: user.role,
          },
        },
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during registration',
      });
    }
  });
      
    // Login endpoint
  router.post('/login', rateLimiter, sanitizeInput, async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;
  
      // Validate input
      if (!email || !password) {
        res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
        return;
      }
  
      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Invalid credentials',
        });
        return;
      }
  
      // Check if the user is a Google-authenticated user
      if (user.authProvider === 'google') {
        res.status(400).json({
          success: false,
          message: 'This user does not have a password. Please use Google authentication.',
        });
        return;
      }
  
      // Compare the provided password with the hashed password in the database
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        res.status(401).json({
          success: false,
          message: 'Invalid credentials',
        });
        return;
      }
  
      // Generate a JWT token
      const token = jwt.sign(
        {
          userId: user._id,
          email: user.email,
          role: user.role,
        },
        process.env.JWT_SECRET!, // Ensure JWT_SECRET is defined in your .env file
        {
          expiresIn: '24h', // Token expires in 24 hours
          algorithm: 'HS256', // Use HMAC-SHA256 algorithm
        }
      );
  
      // Update last login timestamp
      user.lastLogin = new Date();
      await user.save();
  
      // Send the token and user details in the response
      res.status(200).json({
        success: true,
        message: 'Login successful',
        token, // Include the generated token
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          authProvider: user.authProvider,
          profilePicture: user.profilePicture,
          credits: user.credits, // Add credits to response
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred during login',
      });
    }
  });
        // Logout endpoint
  router.post('/logout', async (_req, res) => {
      try {
        // Note: With JWT, we don't need to do anything server-side
        // The client should remove the token from storage
        res.json({
          success: true,
          message: 'Logged out successfully'
        });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during logout'
      });
    }
  });
  
  // Get current user endpoint
  router.get('/me', rateLimiter, sanitizeInput, async (req: Request, res: Response): Promise<void> => {
    try {
      // Log the incoming request headers
      console.log('Request headers:', {
        authorization: req.headers.authorization ? 'Bearer [token]' : 'missing',
        'content-type': req.headers['content-type'],
      });
  
      // Check for authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        console.log('Authorization header missing');
        res.status(401).json({
          success: false,
          message: 'No authorization header provided'
        });
        return;
      }
  
      // Check for proper Bearer token format
      if (!authHeader.startsWith('Bearer ')) {
        console.log('Invalid authorization format - missing Bearer prefix');
        res.status(401).json({
          success: false,
          message: 'Invalid authorization format'
        });
        return;
      }
  
      // Extract the token
      const token = authHeader.split(' ')[1];
      if (!token) {
        console.log('Token missing from Bearer header');
        res.status(401).json({
          success: false,
          message: 'No token provided'
        });
        return;
      }
  
      // Verify JWT_SECRET exists
      if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET not configured');
        res.status(500).json({
          success: false,
          message: 'Server configuration error'
        });
        return;
      }
  
      // Verify the token
      let decoded: JWTPayload;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
        console.log('Token decoded successfully:', {
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role
        });
      } catch (jwtError) {
        console.error('JWT verification failed:', jwtError);
        
        if (jwtError instanceof jwt.TokenExpiredError) {
          res.status(401).json({
            success: false,
            message: 'Token has expired'
          });
          return;
        }
        
        res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
        return;
      }
  
      // Find the user
      const user = await User.findById(decoded.userId)
        .select('-password -verificationCode -verificationCodeExpires -resetToken -resetTokenExpires')
        .lean();
  
      if (!user) {
        console.log('User not found for ID:', decoded.userId);
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
        return;
      }
  
      // Return user data
      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            authProvider: user.authProvider,
            profilePicture: user.profilePicture,
            lastLogin: user.lastLogin,
            apiKey: user.apiKey,
            credits: user.credits,
          }
        }
      });
  
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error getting user details'
      });
    }
  });

  router.post('/reset-password', rateLimiter, sanitizeInput, async (req, res): Promise<void> => {
    try {
      const { email } = req.body;
  
      // Validate email format
      if (!email || !validator.isEmail(email)) {
        res.status(400).json({
          success: false,
          message: 'Invalid email format',
        });
        return;
      }
  
      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }
  
      // Generate a 6-digit numeric verification code
      const verificationCode = randomInt(100000, 999999).toString();
      const expirationTime = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  
      // Save verification code and expiration time in the database
      user.verificationCode = verificationCode;
      user.verificationCodeExpires = expirationTime;
      await user.save();
  
      // Prepare email content
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: '🔒 Password Reset Verification Code',
        html: generateEmail(verificationCode),
      };
  
      // Send the email
      await transporter.sendMail(mailOptions);
  
      res.json({
        success: true,
        message: 'Verification code sent to email',
      });
  
    } catch (error) {
      console.error('Error during password reset:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during password reset',
      });
    }
  }); 
   router.post('/verify-code', async (req, res): Promise<void> => {
    const { email, verificationCode } = req.body;

    try {
      // Find the user by email
      const user = await User.findOne({ email });

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Check if the verification code matches
      if (!user || user.verificationCode !== verificationCode) {
        res.status(400).json({
          success: false,
          message: 'Invalid verification code',
        });
        return;
      }

      // Ensure the verification code has not expired
      if (!user.verificationCodeExpires || new Date() > user.verificationCodeExpires) {
        res.status(400).json({
          success: false,
          message: 'Verification code expired',
        });
      }

      // Verification successful
      res.status(200).json({
        success: true,
        message: 'Verification code verified successfully',
      });
    } catch (error) {
      console.error('Error verifying code:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during verification',
      });
    }
  });

  router.post('/update-password', async (req: Request, res: Response): Promise<void> => {
    const { email, verificationCode, newPassword } = req.body;
  
    try {
      // Validate required fields
      if (!email || !verificationCode || !newPassword) {
        res.status(400).json({
          success: false,
          message: 'All fields are required'
        });
        return;
      }
  
      // Find user and ensure they exist
      const user = await User.findOne({ email });
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
        return;
      }
  
      // Verify the verification code and its expiration
      if (
        user.verificationCode !== verificationCode ||
        !user.verificationCodeExpires ||
        new Date() > user.verificationCodeExpires
      ) {
        res.status(400).json({
          success: false,
          message: 'Invalid or expired verification code'
        });
        return;
      }
  
      // Update password - let the pre-save hook handle the hashing
      user.password = newPassword;
      
      // Clear verification data
      user.verificationCode = undefined;
      user.verificationCodeExpires = undefined;
      
      // Save the user - this will trigger the pre-save hook
      await user.save();
  
      res.status(200).json({
        success: true,
        message: 'Password updated successfully'
      });
      
    } catch (error) {
      console.error('Error updating password:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during password update'
      });
    }
  });

  // Add this endpoint to check if the user is an admin
  router.get('/is-admin', rateLimiter, sanitizeInput, async (req: Request, res: Response): Promise<void> => {
      try {
    // Check for authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({
        success: false,
        message: 'No authorization header provided',
      });
      return;
    }

    // Check for proper Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Invalid authorization format',
      });
      return;
    }

    // Extract the token
    const token = authHeader.split(' ')[1];
    if (!token) {
      res.status(401).json({
        success: false,
        message: 'No token provided',
      });
      return;
    }

    // Verify JWT_SECRET exists
    if (!process.env.JWT_SECRET) {
      res.status(500).json({
        success: false,
        message: 'Server configuration error',
      });
      return;
    }

    // Verify the token
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
    } catch (jwtError) {
      if (jwtError instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          success: false,
          message: 'Token has expired',
        });
        return;
      }
      res.status(401).json({
        success: false,
        message: 'Invalid token',
      });
      return;
    }

    // Check if the user is an admin
    if (decoded.role === 'admin') {
      res.status(200).json({
        success: true,
        message: 'User is an admin',
        isAdmin: true,
      });
    } else {
      res.status(200).json({
        success: true,
        message: 'User is not an admin',
        isAdmin: false,
      });
    }
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during admin check',
    });
  }
});
  export default router;