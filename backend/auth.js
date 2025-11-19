import admin from 'firebase-admin';
import { createUser } from './db.js';

// Initialize Firebase Admin
// In production, use service account key file
// For now, we'll use environment variables
const initializeFirebaseAdmin = () => {
  try {
    // Check if already initialized
    if (admin.apps.length > 0) {
      return;
    }

    // Initialize with service account (if available) or default credentials
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else if (process.env.FIREBASE_PROJECT_ID) {
      // Initialize with minimal config for development
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID
      });
    } else {
      console.warn('⚠️  Firebase Admin not initialized - authentication will not work');
      console.warn('   Set FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_PROJECT_ID environment variable');
    }
  } catch (err) {
    console.error('❌ Error initializing Firebase Admin:', err);
  }
};

initializeFirebaseAdmin();

/**
 * Middleware to verify Firebase authentication token
 */
export async function verifyFirebaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Verify the token with Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Attach user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      displayName: decodedToken.name || decodedToken.email
    };
    
    // Ensure user exists in our database
    await createUser(decodedToken.uid, decodedToken.email, req.user.displayName);
    
    next();
  } catch (err) {
    console.error('❌ Error verifying token:', err);
    return res.status(401).json({ error: 'Invalid authentication token' });
  }
}

/**
 * Optional authentication middleware - allows both authenticated and unauthenticated requests
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        displayName: decodedToken.name || decodedToken.email
      };
      
      await createUser(decodedToken.uid, decodedToken.email, req.user.displayName);
    }
    
    next();
  } catch (err) {
    // If token verification fails, continue without user
    next();
  }
}

export { admin };

