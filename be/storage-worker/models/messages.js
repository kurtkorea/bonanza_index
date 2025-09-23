const Sequelize = require("sequelize");

/**
 * 서버 메시지 모델
 * @class Messages
 * @extends Sequelize.Model
 */
module.exports = class Messages extends Sequelize.Model {
	/**
	 * 모델 초기화
	 * @param {Sequelize} sequelize - Sequelize 인스턴스
	 * @returns {Messages} - 초기화된 모델
	 */
	static init(sequelize) {
		return super.init(
			{
				message_no: {
					type: Sequelize.INTEGER,
					autoIncrement: true,
					primaryKey: true,
					comment: "메시지 고유 번호"
				},
				message_key: {
					type: Sequelize.STRING(50),
					allowNull: false,
					defaultValue: "",
					validate: {
						notEmpty: true,
						len: [1, 50]
					},
					comment: "서버 메시지 키"
				},
				message_msg: {
					type: Sequelize.STRING(100),
					allowNull: false,
					defaultValue: "",
					validate: {
						notEmpty: true,
						len: [1, 100]
					},
					comment: "서버 메시지 내용"
				},
				message_code: {
					type: Sequelize.INTEGER,
					allowNull: false,
					defaultValue: 0,
					validate: {
						isInt: true
					},
					comment: "서버 응답 코드번호"
				},
				message_desc: {
					type: Sequelize.TEXT,
					allowNull: false,
					defaultValue: "",
					comment: "메시지 설명"
				},
				message_use: {
					type: Sequelize.BOOLEAN,
					allowNull: false,
					defaultValue: false,
					comment: "메시지 사용여부"
				}
			},
			{
				sequelize,
				timestamps: true,
				modelName: "Messages",
				tableName: "messages",
				charset: "utf8mb4",
				collate: "utf8mb4_unicode_ci",
				indexes: [
					{ 
						unique: true, 
						fields: ["message_key"],
						name: "idx_message_key"
					},
					{
						fields: ["message_code"],
						name: "idx_message_code"
					},
					{
						fields: ["message_use"],
						name: "idx_message_use"
					}
				],
				hooks: {
					beforeValidate: (message) => {
						if (message.message_key) {
							message.message_key = message.message_key.trim();
						}
						if (message.message_msg) {
							message.message_msg = message.message_msg.trim();
						}
					}
				}
			}
		);
	}

	/**
	 * 메시지 키로 메시지 조회
	 * @param {string} key - 메시지 키
	 * @returns {Promise<Message|null>} - 조회된 메시지
	 */
	static async findByKey(key) {
		return await this.findOne({
			where: { message_key: key, message_use: true }
		});
	}

	/**
	 * 코드로 메시지 조회
	 * @param {number} code - 메시지 코드
	 * @returns {Promise<Message|null>} - 조회된 메시지
	 */
	static async findByCode(code) {
		return await this.findOne({
			where: { message_code: code, message_use: true }
		});
	}
};
