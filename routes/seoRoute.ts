import { Router, Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import dotenv from 'dotenv';
import { CreditManager } from '../utils/creditManager';

dotenv.config();
const seoRouter = Router();

interface MetricBase {
  status: 'good' | 'poor' | 'missing';
  message: string;
  score: number;
  details?: string[];
}

interface SeoData {
  score: number;
  metrics: Record<string, MetricBase>;
}

interface SeoResponse {
  mobile: SeoData;
  desktop: SeoData;
}

async function fetchSEOData(url: string, apiKey: string) {
  console.log('Fetching SEO data for URL:', url);
  console.log('Using API key (first 4 chars):', apiKey.substring(0, 4));

  const mobileData = await makeRequest(url, 'mobile', apiKey);
  const desktopData = await makeRequest(url, 'desktop', apiKey);

  return { mobileData, desktopData };
}

async function makeRequest(url: string, strategy: 'mobile' | 'desktop', apiKey: string, retries = 3) {
  const API_URL = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed`;

  const params = new URLSearchParams({
    url: url,
    strategy: strategy,
    key: apiKey,
    locale: 'en'
  });

  params.append('category', 'performance');
  params.append('category', 'seo');
  params.append('category', 'best-practices');
  params.append('category', 'accessibility');

  const fullUrl = `${API_URL}?${params.toString()}`;
  console.log('Full API URL:', fullUrl);

  try {
    const response = await axios.get(fullUrl, {
      headers: { 'Accept': 'application/json' },
      timeout: 600000
    });
    return response.data;
  } catch (error: unknown) {
    if (retries > 0) {
      console.log(`Retrying request... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
      return makeRequest(url, strategy, apiKey, retries - 1);
    } else {
      if (error instanceof AxiosError) {
        console.error('API Request Error:', error.response ? error.response.data : error.message);
      } else if (error instanceof Error) {
        console.error('API Request Error:', error.message);
      } else {
        console.error('API Request Error:', 'Unknown error occurred');
      }
      throw error;
    }
  }
}

function analyzeSEOData(data: any) {
  // Log incoming data for debugging
  console.log('Analyzing SEO Data:', {
    hasData: !!data,
    hasLighthouse: !!data?.lighthouseResult,
    categories: data?.lighthouseResult?.categories ? Object.keys(data.lighthouseResult.categories) : [],
    audits: data?.lighthouseResult?.audits ? Object.keys(data.lighthouseResult.audits) : []
  });

  if (!data || !data.lighthouseResult) {
    return {
      error: 'No lighthouse data available',
      score: 0,
      metrics: {}
    };
  }

  const { lighthouseResult } = data;
  const audits = lighthouseResult.audits || {};
  const categories = lighthouseResult.categories || {};

  // Log available audits and categories
  console.log('Available Data:', {
    auditKeys: Object.keys(audits),
    categoryKeys: Object.keys(categories)
  });

  const getMetricData = (auditKey: string, displayName: string) => {
    const audit = audits[auditKey];
    if (!audit) {
      console.log(`Missing audit data for ${auditKey}`);
      return {
        status: 'missing',
        message: `${displayName} data unavailable`,
        score: 0,
        details: []
      };
    }

    return {
      status: audit.score >= 0.9 ? 'good' : 'poor',
      message: audit.score >= 0.9 ? `${displayName} is properly set` : `${displayName} needs improvement`,
      score: Math.round((audit.score || 0) * 100),
      details: [
        audit.description || '',
        `Raw score: ${audit.score}`,
        `Display value: ${audit.displayValue || 'N/A'}`
      ].filter(Boolean)
    };
  };

  return {
    score: Math.round((categories.seo?.score || 0) * 100),
    rawData: {
      categoryScores: Object.fromEntries(
        Object.entries(categories).map(([key, cat]: [string, any]) => [
          key,
          Math.round((cat.score || 0) * 100)
        ])
      )
    },
    metrics: {
      title: getMetricData('document-title', 'Title'),
      metaDescription: getMetricData('meta-description', 'Meta description'),
      headings: getMetricData('heading-order', 'Heading structure'),
      // Add more common SEO metrics
      viewport: getMetricData('viewport', 'Viewport'),
      robots: getMetricData('robots-txt', 'Robots.txt'),
      hreflang: getMetricData('hreflang', 'Hreflang'),
      canonical: getMetricData('canonical', 'Canonical URL'),
      fontSizes: getMetricData('font-size', 'Font Sizes'),
      crawlable: getMetricData('is-crawlable', 'Crawlability')
    }
  };
}

seoRouter.post('/seo-audit', CreditManager.handleCredits('data-processor'), async (req: Request, res: Response): Promise<void> => {
  try {
      const { url } = req.body;
      const API_KEY = process.env.PAGESPEED_API_KEY;

      if (!API_KEY) {
          throw new Error('PageSpeed API key is not configured');
      }

      const mobileData = await makeRequest(url, 'mobile', API_KEY);
      const desktopData = await makeRequest(url, 'desktop', API_KEY);

      // Get credit info from response locals
      const creditInfo = res.locals.creditInfo;

      res.json({
          timestamp: new Date().toISOString(),
          url: url,
          rawData: { mobile: mobileData, desktop: desktopData },
          creditInfo: {
            ...creditInfo,
            remainingCredits: creditInfo.remainingCredits // Make sure this is included
        }
      });
  } catch (error: unknown) {
    console.error('Error in /seo-audit:', error);
    if (error instanceof AxiosError) {
      res.status(500).json({
        error: 'API Error',
        message: error.message,
        details: error.response?.data || null,
        timestamp: new Date().toISOString()
      });
    } else if (error instanceof Error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unknown error occurred',
        timestamp: new Date().toISOString()
      });
    }
  }
});

export default seoRouter;