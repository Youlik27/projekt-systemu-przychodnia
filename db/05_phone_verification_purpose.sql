ALTER TABLE PhoneVerification
ADD COLUMN Purpose ENUM('register', 'login')
NOT NULL DEFAULT 'register';