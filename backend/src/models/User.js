import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    pinHash: {
      type: String,
      required: true,
    },
    referralCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    referredByUserId: {
      type: String,
      default: null,
      index: true,
    },
    referrals: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
    walletAddress: {
      type: String,
      default: "",
      trim: true,
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const generateCode = (prefix = "") =>
  `${prefix}${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36).slice(-4)}`.toUpperCase();

userSchema.pre("validate", function preValidate(next) {
  if (!this.userId) {
    this.userId = generateCode("CTV-");
  }

  if (!this.referralCode) {
    this.referralCode = generateCode("CRY-");
  }

  next();
});

userSchema.methods.setPassword = async function setPassword(password) {
  this.passwordHash = await bcrypt.hash(password, 10);
};

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.setPin = async function setPin(pin) {
  this.pinHash = await bcrypt.hash(pin, 10);
};

userSchema.methods.comparePin = function comparePin(pin) {
  return bcrypt.compare(pin, this.pinHash);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    userId: this.userId,
    name: this.name,
    email: this.email,
    referralCode: this.referralCode,
    walletAddress: this.walletAddress,
    role: this.isAdmin ? "admin" : "user",
    isAdmin: this.isAdmin,
    isBlocked: this.isBlocked,
    lastLoginAt: this.lastLoginAt,
    referredByUserId: this.referredByUserId,
    referralsCount: Array.isArray(this.referrals) ? this.referrals.length : 0,
  };
};

userSchema.virtual("role").get(function roleGetter() {
  return this.isAdmin ? "admin" : "user";
});

const User = mongoose.model("User", userSchema);

export default User;
