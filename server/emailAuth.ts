import { RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { storage } from './storage';
import { sendPasswordResetEmail } from './email';

export const register: RequestHandler = async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;

    if (!email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Все поля обязательны' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Пароли не совпадают' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Пароль должен быть не менее 6 символов' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Некорректный email' });
    }

    const existingUser = await storage.getUserByEmail(email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await storage.createUserWithPassword(email.toLowerCase(), passwordHash);

    (req.session as any).userId = user.id;
    (req.session as any).authType = 'email';

    res.json({
      id: user.id,
      email: user.email,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      isAdmin: user.isAdmin,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Ошибка регистрации' });
  }
};

export const login: RequestHandler = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email и пароль обязательны' });
    }

    const user = await storage.getUserByEmail(email.toLowerCase());
    if (!user || !user.passwordHash) {
      return res.status(401).json({ message: 'Неверный email или пароль' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Неверный email или пароль' });
    }

    (req.session as any).userId = user.id;
    (req.session as any).authType = 'email';

    res.json({
      id: user.id,
      email: user.email,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      isAdmin: user.isAdmin,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Ошибка входа' });
  }
};

export const requestPasswordReset: RequestHandler = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email обязателен' });
    }

    const user = await storage.getUserByEmail(email.toLowerCase());
    if (!user) {
      return res.json({ message: 'Если аккаунт существует, вы получите письмо с инструкциями' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await storage.setResetToken(user.id, resetToken, expiresAt);
    
    try {
      await sendPasswordResetEmail(email.toLowerCase(), resetToken);
    } catch (emailError) {
      console.error('Failed to send reset email:', emailError);
    }

    res.json({ message: 'Если аккаунт существует, вы получите письмо с инструкциями' });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ message: 'Ошибка запроса восстановления пароля' });
  }
};

export const resetPassword: RequestHandler = async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Все поля обязательны' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Пароли не совпадают' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Пароль должен быть не менее 6 символов' });
    }

    const user = await storage.getUserByResetToken(token);
    if (!user || !user.resetTokenExpiresAt) {
      return res.status(400).json({ message: 'Недействительная или истекшая ссылка' });
    }

    if (new Date() > new Date(user.resetTokenExpiresAt)) {
      return res.status(400).json({ message: 'Ссылка истекла' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await storage.updateUserPassword(user.id, passwordHash);
    await storage.clearResetToken(user.id);

    res.json({ message: 'Пароль успешно изменен' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Ошибка сброса пароля' });
  }
};

export const isEmailAuthenticated: RequestHandler = async (req, res, next) => {
  const session = req.session as any;
  
  if (session?.userId && session?.authType === 'email') {
    const user = await storage.getUser(session.userId);
    if (user) {
      (req as any).emailUser = user;
      return next();
    }
  }
  
  return res.status(401).json({ message: 'Unauthorized' });
};

export const getEmailUser: RequestHandler = async (req, res) => {
  const session = req.session as any;
  
  if (!session?.userId || session?.authType !== 'email') {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  const user = await storage.getUser(session.userId);
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  res.json({
    id: user.id,
    email: user.email,
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    isAdmin: user.isAdmin,
  });
};

export const logoutEmail: RequestHandler = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ message: 'Ошибка выхода' });
    }
    res.json({ message: 'Выход выполнен успешно' });
  });
};

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const session = req.session as any;
  
  if (!session?.userId || session?.authType !== 'email') {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = await storage.getUser(session.userId);
  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  (req as any).dbUser = user;
  return next();
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  const session = req.session as any;
  
  if (!session?.userId || session?.authType !== 'email') {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = await storage.getUser(session.userId);
  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!user.isAdmin) {
    return res.status(403).json({ message: "Forbidden - Admin access required" });
  }

  (req as any).dbUser = user;
  next();
};
