const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function decompress(buffer) {
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
        return zlib.gunzipSync(buffer);
    }

    return buffer;
}

function getHost(hash) {
    let value = 31;

    for (let i = 0; i < 38; i++) {
        value ^= hash.charCodeAt(i);
    }

    return `t${value % 8}.rbxcdn.com`;
}

async function downloadAsset(hash) {
    const host = getHost(hash);
    const response = await fetch(`https://${host}/${hash}`);

    if (!response.ok) {
        throw new Error(`Gagal mengunduh aset: ${hash}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

module.exports = function (app) {
    app.get("/api/roblox/download/:userId", async (req, res) => {
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

            const avatarResponse = await fetch(
                `https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`,
                {
                    headers: {
                        "x-api-key": apiKey
                    }
                }
            );

            if (!avatarResponse.ok) {
                throw new Error("Gagal mengambil informasi avatar.");
            }

            const avatarResult = await avatarResponse.json();

            if (!avatarResult.imageUrl) {
                throw new Error("Metadata URL avatar tidak ditemukan.");
            }

            const metadataResponse = await fetch(avatarResult.imageUrl);

            if (!metadataResponse.ok) {
                throw new Error("Gagal mengunduh metadata avatar.");
            }

            const metadataBuffer = Buffer.from(
                await metadataResponse.arrayBuffer()
            );

            const metadata = JSON.parse(
                decompress(metadataBuffer).toString("utf8")
            );

            if (
                !metadata.obj ||
                !metadata.mtl ||
                !Array.isArray(metadata.textures) ||
                metadata.textures.length === 0 ||
                !metadata.textures.every(
                    texture => typeof texture === "string" && texture.length > 0
                )
            ) {
                throw new Error("Metadata avatar tidak lengkap.");
            }

            const [objRaw, mtlRaw, ...textureBuffers] =
                await Promise.all([
                    downloadAsset(metadata.obj),
                    downloadAsset(metadata.mtl),
                    ...metadata.textures.map(downloadAsset)
                ]);

            let obj = decompress(objRaw).toString("utf8");
            let mtl = decompress(mtlRaw).toString("utf8");

            const textureFiles = metadata.textures.map(
                (hash, index) => {
                    const filename = `texture${index + 1}.png`;

                    mtl = mtl.replaceAll(hash, filename);

                    return {
                        filename,
                        buffer: textureBuffers[index]
                    };
                }
            );

            if (/^mtllib\s+/m.test(obj)) {
                obj = obj.replace(/^mtllib.*$/gm, "mtllib avatar.mtl");
            } else {
                obj = "mtllib avatar.mtl\n" + obj;
            }

            const outputDir = path.join(
                __dirname,
                "../downloads",
                userId
            );

            fs.mkdirSync(outputDir, { recursive: true });

            // Hapus tekstur lama yang tidak lagi digunakan.
            for (const filename of fs.readdirSync(outputDir)) {
                if (/^texture\d+\.png$/.test(filename)) {
                    fs.unlinkSync(path.join(outputDir, filename));
                }
            }

            fs.writeFileSync(
                path.join(outputDir, "avatar.obj"),
                obj
            );

            fs.writeFileSync(
                path.join(outputDir, "avatar.mtl"),
                mtl
            );

            for (const texture of textureFiles) {
                fs.writeFileSync(
                    path.join(outputDir, texture.filename),
                    texture.buffer
                );
            }

            const files = [
                `/assets/${userId}/avatar.obj`,
                `/assets/${userId}/avatar.mtl`,
                ...textureFiles.map(
                    texture => `/assets/${userId}/${texture.filename}`
                )
            ];

            res.json({
                success: true,
                message: "Avatar berhasil diunduh.",
                textureCount: textureFiles.length,
                files
            });

        } catch (error) {
            console.error("Avatar Downloader:", error);

            res.status(500).json({
                success: false,
                message: "Gagal mengunduh aset avatar.",
                details: error.message
            });
        }
    });
};
