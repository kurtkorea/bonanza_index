const path = require("path");
const dotenv = require("dotenv");
const options = {};
if (process.env.NODE_ENV === "production") {
	dotenv.config({ path: path.join(__dirname, "./env/prod.env") });
	options.host = "";
	options.basePath = `${process.env.SWAGGER_URL}`;
} else {
	dotenv.config({ path: path.join(__dirname, "./env/dev.env") });
	options.host = `localhost:${process.env.PORT}`;
}
const swaggerAutogen = require("swagger-autogen")({ language: "ko" });
const outputFile = "swagger/swagger_autogen.json";
const endpointsFiles = ["./src/app.js"];

swaggerAutogen(outputFile, endpointsFiles, {
	info: {
		title: process.env.SERVICE,
	},
	schemes: ["http", "https"],
	...options
});
