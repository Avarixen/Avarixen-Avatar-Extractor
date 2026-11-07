require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

require("./avatar-downloader")(app);

// Status server
app.get("/", (req, res) => {
    res.json({
        status: "online",
        name: "Avarixen Avatar Extractor",
        version: "1.0.0"
    });
});

// Pencarian username Roblox
app.post("/api/roblox/user", async (req, res) => {
    try {
        const { username } = req.body;

        if (!username || !username.trim()) {
            return res.status(400).json({
                success: false,
                message: "Username tidak boleh kosong."
            });
        }

        const response = await fetch(
            "https://users.roblox.com/v1/usernames/users",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    usernames: [username.trim()],
                    excludeBannedUsers: true
                })
            }
        );

        if (!response.ok) {
            throw new Error("Roblox User API gagal.");
        }

        const result = await response.json();

        if (!result.data?.length) {
            return res.status(404).json({
                success: false,
                message: "Username tidak ditemukan."
            });
        }

        const user = result.data[0];

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.name,
                displayName: user.displayName
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Pengambilan Avatar 3D
app.get("/api/roblox/avatar/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        if (!/^\d+$/.test(userId)) {
            return res.status(400).json({
                success: false,
                message: "User ID tidak valid."
            });
        }

        const apiKey = process.env.ROBLOX_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                success: false,
                message: "Roblox API Key belum dikonfigurasi."
            });
        }

        const response = await fetch(
            `https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`,
            {
                headers: {
                    "x-api-key": apiKey
                }
            }
        );

        const result = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                message: "Roblox Avatar API gagal.",
                details: result
            });
        }

        res.json({
            success: true,
            avatar: result
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Gagal mengambil avatar 3D."
        });
    }
});

app.listen(PORT, () => {
    console.log(`AAE Server running on port ${PORT}`);
});
