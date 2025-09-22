//set server env

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const http = require('http');
const log = require('./utils/logger');
const { send_push } = require("./utils/zmq-sender-push.js");


const { UpbitClient, BithumbClient, KorbitClient, CoinoneClient } = require('./service/mockup_time_weight_execution');

// Start of Selection
global.logging = false;
global.sock = null;

if (process.env.NODE_ENV === "production") {
	dotenv.config({ path: path.join(__dirname, "../env/prod.env") });
	logging = false;
} else {
	dotenv.config({ path: path.join(__dirname, "../env/dev.env") });
	logging = true;
}
const express = require("express");
const app = express();
// const server = require("http").createServer(app);
app.set("port", process.env.PORT || 3000);
var message = {};

const cors = require("cors");
const morgan = require("morgan");

// swagger
const swaggerUi = require("swagger-ui-express");

//cors setting
app.use(cors({ origin: process.env.CORS_ORIGIN.split(","), credentials: true }));

//db connection
const { sequelize, Message } = require("../models");
sequelize
	.sync({ force: false })
	.then(() => console.log("DB 연결 성공"))
	.catch((err) => console.log("DB 연결 실패", err));

//console log middleware
app.use(morgan("dev", { skip: (req, resp) => resp.statusCode < 400 }));

//express setting
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));

app.use(express.static("./swagger"));
app.use(
	"/doc",
	swaggerUi.serve,
	swaggerUi.setup(null, {
		swaggerOptions: {
			url: `${process.env.SWAGGER_URL}/swagger_autogen.json`,
		},
	}),
);

//proxy checker
if (process.env.NODE_ENV === "production") {
	app.set("trust proxy", 1);
}

//routers
const { respMsg } = require("./utils/common");

//discovery register
// const discovery = require("./discovery");
// if (process.env.NODE_ENV === "production") {
// 	discovery.init(app);
// }

//404 handling middleware
app.use((req, res) => {
	respMsg(res, "missing_request");
});

//error handling middleware
app.use((err, req, res, next) => {
	console.log(err.name, err.message);
	respMsg(res, "server_error");
});

async function initializeApp() {
	try {
		// servier 초기화
		// (await Message.findAll({ where: { message_use: true }, attributes: { exclude: ["message_desc", "createdAt", "updatedAt"] }, logging, raw: true })).forEach(
		// 	(row) => (message[row.message_key] = { msg: row.message_msg, code: row.message_code }),
		// );
	} catch (error) {
		console.error('Application initialization failed:', error);
		process.exit(1);
	}
}

initializeApp();

// Start the server
const server = app.listen(app.get("port"), () => {
	console.log(`Server is running on port ${app.get("port")}`);
});



