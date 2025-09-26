// models/tick.js
const { DataTypes } = require("../db/db.js");
const db = require("../db/db.js");

const OrderBook = db.sequelize.define("order_book", {
    symbol:       { type: DataTypes.STRING(64), allowNull:false, primaryKey:true },
    exchange_no:  { type: DataTypes.INTEGER,    allowNull:false, primaryKey:true },
    seq:          { type: DataTypes.BIGINT,     allowNull:false, primaryKey:true },
    exchange_name:{ type: DataTypes.STRING(64) },
    side:         { type: DataTypes.STRING(1) },
    price:        { type: DataTypes.DOUBLE },
    size:         { type: DataTypes.DOUBLE },
    fromAt:       { type: DataTypes.DATE },
    createdAt:    { type: DataTypes.DATE },
    diff_ms:      { type: DataTypes.DOUBLE },
    diff_ms_db:   { type: DataTypes.DOUBLE },
    raw:          { type: DataTypes.TEXT },
}, {
  tableName: "tb_order_book",
  timestamps: false,
  freezeTableName: true,
  createdAt: false,
  updatedAt: false,
  
});
module.exports = { OrderBook };
