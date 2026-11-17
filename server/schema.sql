-- ========================================================
-- NANATI'S BIRTHDAY CELEBRATION WEBSITE
-- MySQL Relational Database Schema
-- ========================================================

CREATE DATABASE IF NOT EXISTS `nanati_birthday` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `nanati_birthday`;

-- 1. Gifts Table
CREATE TABLE IF NOT EXISTS `gifts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `image_url` VARCHAR(500) NOT NULL,
  `is_enabled` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Participants Table
CREATE TABLE IF NOT EXISTS `participants` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `session_id` VARCHAR(100) UNIQUE,
  `assigned_gift_id` INT,
  `game_completed` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`assigned_gift_id`) REFERENCES `gifts`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Birthday Messages Table
CREATE TABLE IF NOT EXISTS `messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `participant_id` INT NULL,
  `name` VARCHAR(255) NOT NULL,
  `content` TEXT NOT NULL,
  `gift_id` INT NULL,
  `is_liked` TINYINT(1) DEFAULT 0,
  `admin_reply` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`gift_id`) REFERENCES `gifts`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Gallery Photos Table
CREATE TABLE IF NOT EXISTS `gallery` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `image_url` VARCHAR(500) NOT NULL,
  `description` VARCHAR(500) NULL,
  `sort_order` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5a. Media (videos, music, voice messages)
CREATE TABLE IF NOT EXISTS `media` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `kind` VARCHAR(20) NOT NULL,
  `url` VARCHAR(500) NOT NULL,
  `title` VARCHAR(200) NULL,
  `sort_order` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Admin Users Table
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(100) UNIQUE NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initial Seed Data: The 10 Default Gifts
INSERT INTO `gifts` (`id`, `name`, `description`, `image_url`, `is_enabled`) VALUES
(1, 'ውዳሴ ማርያም', 'The holy and blessed book of Wudase Mariam prayers and praises.', '/images/gifts/wudase-mariam.png', 1),
(2, 'Chocolate', 'Delicious Milka Oreo Alpine milk chocolate treats!', '/images/gifts/milka-oreo.jpg', 1),
(3, 'Cute Bracelet', 'Charming handcrafted beaded flower bracelet.', '/images/gifts/pink-bracelet.jpg', 1),
(4, 'የእመቤታችን ስዕል አድኖ', 'Blessed Virgin Mary traditional Ethiopian Orthodox sacred icon.', '/images/gifts/mariam-icon.jpg', 1),
(5, 'Invite Me Out for Tea and እርጥብ', 'A special warm outing for cozy hot tea and delicious traditional ertib!', '/images/gifts/tea-ertib.jpg', 1),
(6, 'Flower Hair Clip', 'Delicate and cute pink floral aesthetic hair accessory.', '/images/gifts/flower-hair-clip.jpg', 1),
(7, 'Socks', 'Super soft, warm and cute cozy patterned socks.', '/images/gifts/socks.svg', 1),
(8, 'Daily Data Package', 'High-speed daily mobile data package for unlimited connection.', '/images/gifts/daily-data.svg', 1),
(9, 'Meskel', 'Exquisite Ethiopian traditional engraved cross pendant.', '/images/gifts/meskel-cross.jpg', 1),
(10, 'Invite Me to Mezmur', 'A beautiful spiritual invitation to attend uplifting mezmur worship.', '/images/gifts/invite-mezmur.svg', 1)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

-- Initial Seed Data: Personal Gallery Photos (Excluding Homepage Hero)
INSERT INTO `gallery` (`image_url`, `description`, `sort_order`) VALUES
('/images/gallery/nanati-1.jpg', 'Radiant smile and gorgeous curls ✨', 1),
('/images/gallery/nanati-2.jpg', 'Cherishing memories that warm the heart ❤️', 2),
('/images/gallery/nanati-3.jpg', 'Birthday glow with my favorite cake 🎂', 3),
('/images/gallery/nanati-4.jpg', 'Another chapter of grace, elegance, and laughter 🌸', 4);

-- Admin account: NOT seeded here on purpose.
-- The server creates it on first start from ADMIN_DEFAULT_USER / ADMIN_DEFAULT_PASS
-- in your .env file, and stores the password as a secure hash (never plain text).
