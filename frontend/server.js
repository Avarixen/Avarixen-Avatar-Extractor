const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

app.use("/assets", express.static(
path.join(__dirname, "../downloads")
));

app.use(express.static(__dirname));

app.listen(PORT, () => {
console.log("AAE Frontend running on port ${PORT}");
});
