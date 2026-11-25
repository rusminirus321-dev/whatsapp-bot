
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const fs = require("fs");
const crypto = require("crypto");

const BOT_NAME = "AUREVA BOT";

// Ganti dengan nomor WhatsApp admin milikmu.
// Format: kode negara + nomor, tanpa tanda +.
const OWNER_NUMBER = "62895323423204";

const DB_FILE = "./database.json";

const APPS = [
  "capcut",
  "spotify",
  "youtube",
  "wink",
  "alightmotion"
];

const PLANS = [7, 30, 365];

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { orders: [] };
  }
}

let db = loadDB();

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function makeId() {
  return "ARV-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

function isOwner(jid) {
  return jid && jid.split("@")[0] === OWNER_NUMBER;
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatDate(date) {
  return new Date(date).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta"
  });
}

function menu() {
  return `
╭━━━『 ${BOT_NAME} 』━━━
│
│ ✦ Layanan Pesanan Premium
│
│ !menu
│ !paket
│ !pesan aplikasi email paket
│ !status ID
│ !riwayat
│
│ Contoh:
│ !pesan spotify email@gmail.com 30
│
╰━━━━━━━━━━━━━━━━━━━━
Catatan:
Aktivasi aplikasi hanya melalui penyedia
atau distributor resmi yang berwenang.
`;
}

function findOrder(id) {
  return db.orders.find(
    order => order.id === id.toUpperCase()
  );
}

async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./session");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    browser: ["AUREVA BOT", "Chrome", "1.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", update => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log(`${BOT_NAME} berhasil terhubung.`);
    }

    if (connection === "close") {
      const code =
        lastDisconnect?.error?.output?.statusCode;

      if (code !== DisconnectReason.loggedOut) {
        startBot();
      } else {
        console.log("Sesi keluar. Hubungkan ulang WhatsApp.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];

    if (!msg || !msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    if (!jid || jid.endsWith("@g.us")) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      "";

    const args = text.trim().split(/\s+/);
    const command = (args[0] || "").toLowerCase();

    const reply = async message => {
      await sock.sendMessage(jid, { text: message }, {
        quoted: msg
      });
    };

    try {
      if (command === "!menu") {
        return reply(menu());
      }

      if (command === "!paket") {
        return reply(`
╭━━━『 PAKET AUREVA 』━━━
│
│ 7 hari
│ 30 hari
│ 365 hari
│
│ Harga dan ketersediaan mengikuti
│ penyedia resmi yang bekerja sama.
╰━━━━━━━━━━━━━━━━━━━━
`);
      }

      if (command === "!pesan") {
        const app = (args[1] || "").toLowerCase();
        const email = (args[2] || "").toLowerCase();
        const days = Number(args[3]);

        if (!APPS.includes(app)) {
          return reply(
            "Aplikasi tidak dikenali.\nPilihan: " +
            APPS.join(", ")
          );
        }

        if (!validEmail(email)) {
          return reply(
            "Format email belum benar.\n" +
            "Contoh: !pesan spotify email@gmail.com 30"
          );
        }

        if (!PLANS.includes(days)) {
          return reply(
            "Paket tersedia: 7, 30, atau 365 hari."
          );
        }

        const order = {
          id: makeId(),
          jid,
          app,
          email,
          days,
          status: "MENUNGGU",
          createdAt: new Date().toISOString(),
          activatedAt: null,
          expiresAt: null
        };

        db.orders.push(order);
        saveDB();

        return reply(`
╭━━━『 PESANAN DIBUAT 』━━━
│
│ ID: ${order.id}
│ Aplikasi: ${app}
│ Email tujuan: ${email}
│ Paket: ${days} hari
│ Status: MENUNGGU
│
╰━━━━━━━━━━━━━━━━━━━━
Pesanan sudah tercatat.
Aktivasi belum dilakukan.
Tunggu konfirmasi penyedia resmi.
Gunakan !status ${order.id}
`);
      }

      if (command === "!status") {
        const id = args[1];

        if (!id) {
          return reply("Contoh: !status ARV-ABC123");
        }

        const order = findOrder(id);

        if (!order) {
          return reply("Pesanan tidak ditemukan.");
        }

        if (order.jid !== jid && !isOwner(jid)) {
          return reply("Kamu tidak memiliki akses ke pesanan ini.");
        }

        return reply(`
╭━━━『 STATUS PESANAN 』━━━
│ ID: ${order.id}
│ Aplikasi: ${order.app}
│ Email: ${order.email}
│ Paket: ${order.days} hari
│ Status: ${order.status}
│ Dibuat: ${formatDate(order.createdAt)}
│ ${order.expiresAt
  ? "Berakhir: " + formatDate(order.expiresAt)
  : "Masa aktif belum dimulai"}
╰━━━━━━━━━━━━━━━━━━━━
`);
      }

      if (command === "!riwayat") {
        const orders = db.orders.filter(
          order => order.jid === jid
        );

        if (!orders.length) {
          return reply("Belum ada riwayat pesanan.");
        }

        const history = orders.slice(-10).reverse()
          .map(order =>
            `${order.id} | ${order.app} | ${order.status}`
          ).join("\n");

        return reply("RIWAYAT PESANAN\n\n" + history);
      }

      // Perintah khusus admin
      if (command === "!pesanan") {
        if (!isOwner(jid)) {
          return reply("Perintah khusus admin.");
        }

        const pending = db.orders.filter(
          order => order.status === "MENUNGGU"
        );

        if (!pending.length) {
          return reply("Tidak ada pesanan yang menunggu.");
        }

        const list = pending.map(order =>
          `${order.id}\n${order.app} | ${order.email} | ${order.days} hari`
        ).join("\n\n");

        return reply("PESANAN MENUNGGU\n\n" + list);
      }

      if (command === "!selesai") {
        if (!isOwner(jid)) {
          return reply("Perintah khusus admin.");
        }

        const order = findOrder(args[1]);

        if (!order) {
          return reply("ID pesanan tidak ditemukan.");
        }

        if (order.status !== "MENUNGGU") {
          return reply("Pesanan ini bukan berstatus MENUNGGU.");
        }

        // Gunakan hanya setelah penyedia resmi
        // benar-benar mengonfirmasi aktivasi.
        const now = new Date();
        const expiry = new Date(now);
        expiry.setDate(expiry.getDate() + order.days);

        order.status = "AKTIF";
        order.activatedAt = now.toISOString();
        order.expiresAt = expiry.toISOString();

        saveDB();

        await sock.sendMessage(order.jid, {
          text: `
Pesanan ${order.id} telah dikonfirmasi admin.
Status: AKTIF
Aplikasi: ${order.app}
Email: ${order.email}
Masa aktif: ${order.days} hari
Berakhir: ${formatDate(order.expiresAt)}
`
        });

        return reply(
          `Pesanan ${order.id} diperbarui menjadi AKTIF.`
        );
      }

      if (command === "!tolak") {
        if (!isOwner(jid)) {
          return reply("Perintah khusus admin.");
        }

        const order = findOrder(args[1]);

        if (!order) {
          return reply("ID pesanan tidak ditemukan.");
        }

        order.status = "DITOLAK";
        saveDB();

        await sock.sendMessage(order.jid, {
          text: `Pesanan ${order.id} belum dapat diproses. Silakan hubungi admin.`
        });

        return reply(`Pesanan ${order.id} ditandai DITOLAK.`);
      }

      if (command === "!dashboard") {
        if (!isOwner(jid)) {
          return reply("Perintah khusus admin.");
        }

        const total = db.orders.length;
        const pending = db.orders.filter(
          x => x.status === "MENUNGGU"
        ).length;
        const active = db.orders.filter(
          x => x.status === "AKTIF"
        ).length;

        return reply(`
╭━━━『 DASHBOARD 』━━━
│ Total pesanan: ${total}
│ Menunggu: ${pending}
│ Aktif: ${active}
╰━━━━━━━━━━━━━━━━━━━━
`);
      }

    } catch (error) {
      console.error("Kesalahan perintah:", error);
      await reply("Terjadi kesalahan. Coba lagi nanti.");
    }
  });
}

startBot().catch(console.error);
