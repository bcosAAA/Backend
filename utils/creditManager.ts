// creditManager.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/user';

interface DecodedToken {
  userId: string;
  role: string;
  email: string;
}

export class CreditManager {
  private static readonly CREDIT_COSTS = {
    'ytSummarizer': 5,
    'image-generator': 3,
    'code-generator': 2,
    'data-processor': 5,
    'api-request': 1,
  } as const;

  static getCreditCost(toolName: keyof typeof CreditManager.CREDIT_COSTS): number {
    return CreditManager.CREDIT_COSTS[toolName] || 1;
  }

  // Updated middleware to properly handle types
  static handleCredits(toolName: keyof typeof CreditManager.CREDIT_COSTS) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
          res.status(401).json({
            success: false,
            message: 'Authentication required',
          });
          return;
        }

        const creditsRequired = CreditManager.getCreditCost(toolName);

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as DecodedToken;
        const user = await User.findById(decoded.userId);

        if (!user) {
          res.status(404).json({
            success: false,
            message: 'User not found',
          });
          return;
        }

        if (user.credits < creditsRequired) {
          const transaction = {
            amount: creditsRequired,
            action: 'deduction' as const,
            toolName,
            timestamp: new Date(),
            details: 'Insufficient credits',
          };

          user.creditHistory.push(transaction);
          await user.save();

          res.status(403).json({
            success: false,
            message: 'Insufficient credits',
            currentCredits: user.credits,
            required: creditsRequired,
            toolName,
          });
          return;
        }

        user.credits -= creditsRequired;

        const transaction = {
          amount: creditsRequired,
          action: 'deduction' as const,
          toolName,
          timestamp: new Date(),
        };

        user.creditHistory.push(transaction);
        await user.save();

        res.locals.user = user;
        res.locals.creditInfo = {
          previousBalance: user.credits + creditsRequired,
          creditsUsed: creditsRequired,
          remainingCredits: user.credits,
        };

        next();
      } catch (error) {
        console.error('Credit handling error:', error);
        res.status(500).json({
          success: false,
          message: 'Error processing credits',
        });
        return;
      }
    };
  }
}