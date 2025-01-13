import mongoose from 'mongoose';

// Define the Newsletter Subscriber Schema
const newsletterSubscriberSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  subscribedAt: {
    type: Date,
    default: Date.now,
  },
});

// Create and export the model
const NewsletterSubscriber = mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema);

export default NewsletterSubscriber; // Default export
