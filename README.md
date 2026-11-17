# 🎂 Nanati's Birthday Celebration Website

A modern, responsive, and interactive birthday celebration website built for **Nanati**. Friends and family can play the **Wishing Balloon Game**, reveal their assigned birthday mission/gift, send personal birthday wishes, and browse Nanati's personal photo gallery.

---

## 🌟 Key Features

1. **Homepage Hero Section**:
   - Uses Nanati's **first uploaded photograph** (holding the birthday cake with candle) in an ornate royal gilded frame. Her face, hairstyle, and identity are preserved.
   - **No Balloons on the homepage**, per strict specification.
   - Features the main heading *"It's My Special Day! 🎂"*, rotating funny birthday statements, a warm welcome message, and action buttons.
   - **About Me Section**: Heartfelt note from Nanati and her funny quote:
     > *"Life is short, eat chocolate, make memories, keep promises, and never forget my birthday gift! 😂"*

2. **The Wishing Balloon Game 🎈🏹**:
   - Floating balloons styled in Nanati's luxury color palette (Chocolate Brown, Cream, Beige, Champagne Gold, Soft Caramel).
   - Interactive bow and arrow physics: visitors aim with mouse or touch, and shoot to pop balloons.
   - Real-time balloon popping animations with synthesized audio pop effects (plus a mute button).
   - **Animated 3D Gift Box Reveal**: The gift box pops open to reveal the assigned gift photograph, description, and funny birthday mission:
     > *"Congratulations! You have officially selected Nanati's birthday gift. No escaping now! 😂"*
   - Pre-fills the participant's name and smoothly redirects directly to the Birthday Messages section.

3. **Birthday Messages 💌**:
   - Visitors can submit wishes or pick from 7 selectable suggested birthday wishes.
   - **Exact Card Layout**:
     - **Top Row**: Participant's name on the left, **`🎁 Show`** button on the right.
     - **Gift Reveal**: Clicking `🎁 Show` smoothly expands the participant's assigned gift picture and name.
     - **Middle**: Participant's birthday message.
     - **Like Section**: Heart icon with `"Liked by Nanati"`.
     - **Reply Section**: Nanati's reply box in a soft caramel/beige card.
   - Celebratory confetti shower upon wish submission.

4. **View More Photos Gallery 📸**:
   - Features only the other personal photographs of Nanati in a responsive masonry grid.
   - Fullscreen lightbox modal with Next (`❯`), Previous (`❮`), and Close (`×`) controls.

5. **Private Administrator Lounge 👑 (Nanati Only)**:
   - Protected by authentication (**Username**: `nanati`, **Password**: `nanati2026`).
   - Real-time birthday statistics overview.
   - Dynamic gift management (add gifts with image upload, toggle availability, delete).
   - Message management (like/unlike messages, write/edit/delete replies, delete messages).
   - Participant list & assigned missions tracking.
   - Gallery photo management (upload new photos with captions, delete photos).

---

## 🎨 Luxury Color Palette

- **Dark Chocolate Brown**: `#542D1E`
- **Deep Brown**: `#3B2118`
- **Warm Beige**: `#E8D8C3`
- **Soft Cream**: `#F8F1E7`
- **Champagne Gold**: `#D6B77A`
- **Ivory White**: `#FFFDF8`
- **Soft Caramel**: `#B8875A`

---

## 🎁 The 10 Default Gifts Pre-Loaded

1. **ውዳሴ ማርያም** (Uploaded book photograph)
2. **Chocolate** (Uploaded Milka Oreo photograph)
3. **Cute Bracelet** (Uploaded pink beaded flower charm photograph)
4. **የእመቤታችን ስዕል አድኖ** (Uploaded Ethiopian Orthodox icon)
5. **Invite Me Out for Tea and እርጥብ** (Uploaded tea & ertib photograph)
6. **Flower Hair Clip** (Uploaded floral hair clip photograph)
7. **Socks** (Cute cozy socks artwork)
8. **Daily Data Package** (5G unlimited data package artwork)
9. **Meskel** (Uploaded Ethiopian engraved cross photograph)
10. **Invite Me to Mezmur** (Spiritual invitation artwork)

---

## 💻 Tech Stack (Zero Python)

- **Frontend**: HTML5, Modern CSS3, JavaScript (Canvas API, Web Audio API, Fetch API).
- **Backend**: Node.js 22.5+ & Express REST APIs with `multer` file uploads.
- **Database**: SQLite (built into Node, zero setup) - or MySQL automatically if one is running (`server/schema.sql` is available for MySQL Workbench).

---

## 🚀 How to Run the Website

**Requires Node.js 22.5 or newer** (https://nodejs.org).

- **Windows**: double-click `start.bat`.
- **Anywhere**: `npm install` (only if `node_modules` is missing), then `npm start`, then open **http://localhost:3000**.

Optional: copy `.env.example` to `.env` to change the port, database, or first admin login.

---

## 👑 Nanati's Lounge (your private admin page)

Open **http://localhost:3000/admin.html** (online: `https://YOUR-LINK/admin.html`). It is a separate page, only for you:

| Tab | What you can do |
|---|---|
| 🎂 Overview | Counts of guests, wishes, replies, photos, videos, music |
| 💌 Wishes & Replies | Read every wish, ❤️ like, **reply** (shows under the wish on your page), delete |
| 👥 Guests | Everyone who played, their gift mission, how many wishes they sent |
| 🎁 Gifts | Add / edit (even change the picture) / switch off / delete gifts |
| 📸 Photos | Add several at once, edit caption & order, replace or delete |
| 🎬 Videos | Upload short videos (MP4 best, up to 40 MB) - appear on your page; edit / delete |
| 🎵 Music & Voice | Upload birthday music (plays when a guest taps **Music**), **record a voice message in the browser**, or upload one; edit / delete |
| ⚙️ Settings | Change password, copy the link to share |

Your friends only get the public page (`/`). It has a tiny "👑 Nanati's Lounge" link in the footer that leads to the login screen.

**First login:** username `nanati`, password `nanati2026` (or what is in `.env`). **Change it straight away** in Settings.
The password is stored hashed, and the server warns in its console while the default is still active.

## 🌍 Putting it online for friends

You need a host that runs Node.js (Render, Railway, a VPS...). Tips:
- Set `TRUST_PROXY=1` so spam limits count each guest separately.
- Keep `server/nanati_birthday.db` and `public/uploads/` on a **persistent disk**, or guests' wishes and uploaded photos disappear on every redeploy.
- Everything you upload (photos, videos, music) is saved in `public/uploads/`, and wishes in `server/nanati_birthday.db` - back those two up.
- **Quickest way to share from your own PC (free):** run `start.bat`, then in a second window `cloudflared tunnel --url http://localhost:3000` and send friends the `https://....trycloudflare.com` link. Add `TRUST_PROXY=1` to `.env`. The link works only while your PC is on.
- Voice recording needs a secure (https) link or localhost - tunnel links are https, so it works there.

## 🛡️ Safety built in

Admin-only routes require a real login (12h session) · images-only uploads checked by type (photos 8 MB, video 40 MB, audio 15 MB) · message length limits · generous anti-spam limits · guests' gifts are decided by the server, never by the browser · all guest text is escaped (no script injection).
