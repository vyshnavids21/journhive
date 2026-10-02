require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Post = require('./models/post');
const Trip = require('./models/trip');
const mongoose = require('mongoose');
const path = require('path');
const User = require('./models/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const auth = require('./middleware/auth');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const crypto = require('crypto');
const { sendResetEmail } = require('./utils/mailer');

const app = express();
const PORT = process.env.PORT || 3200;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'journhive',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
  }
});

const upload = multer({ storage });

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log("Connected to database"))
  .catch(err => console.error("Db connection failed:", err.message));

const allowedOrigins = [
  'http://localhost:4200',
  'http://localhost:4300',
  'https://journhive.vercel.app',
  'https://journhive-33.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));

app.use(bodyParser.json({ limit: '200mb' }));
app.use(express.json({ limit: '200mb' }));

app.post('/api/trips', auth, upload.single('coverPhoto'), async (req, res) => {
  try {
    const coverPhotoPath = req.file ? req.file.path : null;

    const trip = new Trip({
      destination: req.body.destination,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      coverPhoto: coverPhotoPath,
      creatorId: req.body.creatorId
    });

    const savedTrips = await trip.save();
    res.status(201).json({ message: 'Trip added successfully', trips: savedTrips });
  } catch (error) {
    res.status(500).json({ message: 'Error adding trip', error: error.message });
  }
});

app.post('/api/posts', auth, upload.single('image'), async (req, res) => {
  try {
    const imagePath = req.file ? req.file.path : null;

    const post = new Post({
      title: req.body.title,
      caption: req.body.caption,
      image: imagePath,
      creatorId: req.body.creatorId,
      tripId: req.body.tripId || null,
      skipImage: req.body.skipImage === 'true',
      value: req.body.value,
      date: req.body.date,
    });

    const savedPost = await post.save();
    res.status(201).json({ message: 'Post added successfully', posts: savedPost });
  } catch (error) {
    res.status(500).json({ message: 'Error adding post', error: error.message });
  }
});

app.get('/api/posts/creator/:creatorId', auth, async (req, res) => {
  try {
    const { creatorId } = req.params;
    const documents = await Post.find({ creatorId });
    const data = documents.map(doc => ({
      id: doc._id,
      title: doc.title,
      caption: doc.caption,
      image: doc.image || null,
      creatorId: doc.creatorId,
      tripId: doc.tripId || null,
      skipImage: doc.skipImage,
      value: doc.value,
      date: doc.date
    }));
    res.status(200).json({ message: 'Posts fetched successfully', posts: data });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch posts', error: error.message });
  }
});

app.get('/api/posts/trip/:tripId', auth, async (req, res) => { //fetching posts by tripId on clicking view details from trip dashboard
  try {
    const { tripId } = req.params;
    const documents = await Post.find({ tripId });
    const data = documents.map(doc => ({
      id: doc._id,
      title: doc.title,
      caption: doc.caption,
      image: doc.image || null,
      creatorId: doc.creatorId,
      tripId: doc.tripId || null,
      skipImage: doc.skipImage,
      value: doc.value,
      date: doc.date
    }));
    res.status(200).json({ message: 'Posts fetched successfully', posts: data });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch posts', error: error.message });
  }
});

app.get('/api/trips/creator/:creatorId', auth, async (req, res) => {
  try {
    const { creatorId } = req.params;
    const fetchedTrips = await Trip.find({ creatorId });
    res.status(200).json({ message: 'Trips fetched successfully', trips: fetchedTrips });
  }
  catch (error) {
    res.status(500).json({ message: 'Error fetching trips', error: error.message });
  }
});

app.delete('/api/posts/:id', auth, async (req, res) => {
  try {
    const result = await Post.deleteOne({ _id: req.params.id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.status(200).json({ message: 'Post deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting post', error: error.message });
  }
});

app.delete('/api/trips/:tripId', auth, async (req, res) => {
  try {
    const result = await Trip.deleteOne({ _id: req.params.tripId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    res.status(200).json({ message: 'Trip deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting trip', error: error.message });
  }
});

app.get('/api/posts/:id', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (post) {
      res.status(200).json({
        id: post._id,
        title: post.title,
        caption: post.caption,
        image: post.image,
        skipImage: post.skipImage,
        value: post.value,
        date: post.date,
        tripId: post.tripId || null,
        creatorId: post.creatorId
      });
    } else {
      res.status(404).json({ message: 'Post not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching post', error: error.message });
  }
});

app.get('/api/trips/:id', auth, async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (trip) {
      res.status(200).json({
        id: trip._id,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        coverPhoto: trip.coverPhoto || null,
        skipImage: trip.skipImage || false,
        creatorId: trip.creatorId
      });
    } else {
      res.status(404).json({ message: 'Trip not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching trip', error: error.message });
  }
});

app.put('/api/posts/:id', auth, upload.single('image'), async (req, res) => {
  try {
    let imagePath = req.body.image;

    if (req.file) {
      imagePath = req.file.path;
    }

    const updatedPost = {
      title: req.body.title,
      caption: req.body.caption,
      image: imagePath,
      skipImage: req.body.skipImage === 'true',
      value: req.body.value,
      date: req.body.date,
      tripId: req.body.tripId || null,
    };

    const result = await Post.updateOne({ _id: req.params.id }, updatedPost);

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.status(200).json({ message: result.modifiedCount > 0 ? 'Post updated successfully': 'No changes made', post: updatedPost
    });

  } catch (error) {
    res.status(500).json({ message: 'Error updating post', error: error.message });
  }
});

app.put('/api/trips/:id', auth, upload.single('coverPhoto'), async (req, res) => {
  try {
    let imagePath = req.body.coverPhoto;

    if (req.file) {
      imagePath = req.file.path;
    }

    if (req.body.skipImage === 'true' || imagePath === '') {
      imagePath = null;
    }

    const updatedTrip = {
      destination: req.body.destination,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      coverPhoto: imagePath,
      creatorId: req.body.creatorId
    };

    const result = await Trip.updateOne({ _id: req.params.id }, updatedTrip);

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    res.status(200).json({ message: 'Trip updated successfully', trip: updatedTrip });
  } catch (error) {
    res.status(500).json({ message: 'Error updating trip', error: error.message });
  }
});

function generateToken(user) {
  return jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

app.post('/api/users', upload.none(), async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const user = new User({
      name: req.body.name,
      email: req.body.email,
      password: hashedPassword
    });

    const savedUser = await user.save();
    const token = generateToken(savedUser);
    res.status(201).json({ message: 'Signup successfull', user: savedUser, token });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Email already registered' });
    }
    console.error('Signup failed:', error.message);
    res.status(500).json({ message: 'Signup failed', error });
  }
});

// Compared against when the email doesn't exist, so both failure cases take the same time.
const DUMMY_HASH = bcrypt.hashSync('journhive-dummy-password', 10);

app.post('/api/login', upload.none(), async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    // Same response for an unknown email and a wrong password, so callers can't
    // tell which emails have accounts (user enumeration).
    const match = await bcrypt.compare(password || '', user ? user.password : DUMMY_HASH);
    if (!user || !match) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = generateToken(user);
    res.status(200).json({ message: 'Login successful', user, token });
  } catch (error) {
    res.status(500).json({ message: 'Login failed', error });
  }
});

app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Respond the same whether or not the account exists (prevents user enumeration).
    const genericMessage = 'If an account exists for this email, a password reset link has been sent';
    if (!user) return res.status(200).json({ message: genericMessage });

    // Generate a random token; email the raw value but store only its hash.
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4300';
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    const previewUrl = await sendResetEmail(user.email, resetUrl);

    res.status(200).json({ message: genericMessage, previewUrl });
  } catch (error) {
    console.error('Forgot-password failed:', error.message);
    res.status(500).json({ message: 'Failed to process request', error });
  }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired' });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset-password failed:', error.message);
    res.status(500).json({ message: 'Failed to reset password', error });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
