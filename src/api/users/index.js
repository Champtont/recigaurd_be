import express from "express";
import createHttpError from "http-errors";
import passport from "passport";
import q2m from "query-to-mongo";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { adminOnlyMiddleware } from "../../lib/auth/adminAuth.js";
import { JWTAuthMiddleware } from "../../lib/auth/jwtAuth.js";
import { createAccessToken } from "../../lib/auth/tools.js";
import UsersModel from "./model.js";
import RecipesModel from "../recipes/model.js";

const usersRouter = express.Router();
//*********User Endpoints******
//register
usersRouter.post("/register", async (req, res, next) => {
  try {
    const newUser = new UsersModel(req.body);
    const { _id } = await newUser.save();
    if ({ _id }) {
      const payload = { _id: newUser._id, role: newUser.role };
      const accessToken = await createAccessToken(payload);
      res.send({ accessToken });
    }
  } catch (error) {
    next(error);
  }
});
//googleEnd points
usersRouter.get(
  "/googleLogin",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

usersRouter.get(
  "/googleRedirect",
  passport.authenticate("google", { session: false }),
  async (req, res, next) => {
    console.log(req.user);
    res.redirect(`${process.env.FE_URL}/${req.user.accessToken}`);
  }
);
//logIn
usersRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await UsersModel.checkCredentials(email, password);

    if (user) {
      const payload = { _id: user._id, role: user.role };

      const accessToken = await createAccessToken(payload);
      res.send({ accessToken });
    } else {
      next(createHttpError(401, "Credentials are not ok!"));
    }
  } catch (error) {
    next(error);
  }
});
//logOut
usersRouter.get("/logout", JWTAuthMiddleware, async (req, res, next) => {
  try {
    const user = await UsersModel.findById(req.user._id);
    res.clearCookie("jwt");
    await user.save();
    res.status(200).send({ message: "You're logged out" });
  } catch (error) {
    next(error);
  }
});
//Get My Info
usersRouter.get("/me", JWTAuthMiddleware, async (req, res, next) => {
  try {
    const user = await UsersModel.findById(req.user._id);
    res.send(user);
  } catch (error) {
    next(error);
  }
});
//Edit My info
usersRouter.put("/me", JWTAuthMiddleware, async (req, res, next) => {
  try {
    const updatedUser = await UsersModel.findByIdAndUpdate(
      req.user._id,
      req.body,
      { new: true, runValidators: true }
    );
    if (updatedUser) {
      res.send(updatedUser);
    } else {
      next(createError(404, `User with id ${req.user._id} not found!`));
    }
  } catch (error) {
    next(error);
  }
});
//Edit My profile pic
const cloudinaryUploader = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: {
      folder: "ReciGaurd_profiles",
    },
  }),
}).single("avatar");

usersRouter.post(
  "/me/avatar",
  JWTAuthMiddleware,
  cloudinaryUploader,
  async (req, res, next) => {
    try {
      const user = await UsersModel.findByIdAndUpdate(
        req.user._id,
        { avatar: req.file.path },
        { new: true }
      );
      if (!user)
        next(createError(404, `No user wtih the id of ${req.user._id}`));
      res.status(201).send(user);
    } catch (error) {
      res.send(error);
      next(error);
    }
  }
);
//*********Recipe Endpoints*****
//Get All My recipes
usersRouter.get("/me/recipes", JWTAuthMiddleware, async (req, res, next) => {
  try {
    const mongoQuery = q2m(req.query);
    const recipes = await RecipesModel.find({
      author: req.user._id,
    }).populate({ path: "author", select: "firstName avatar" });

    if (recipes) {
      res.send(recipes);
    } else {
      next(
        createHttpError(
          404,
          `No recipes hosted by user ${req.user._id} were found.`
        )
      );
    }
  } catch (error) {
    next(error);
  }
});
//Edit My recipes
usersRouter.put("/me/:recipeId", JWTAuthMiddleware, async (req, res, next) => {
  try {
    const updatedRecipe = await RecipesModel.findByIdAndUpdate(
      req.params.recipeId,
      req.body,
      { new: true, runValidators: true }
    );
    if (updatedRecipe) {
      res.send(updatedRecipe);
    } else {
      next(
        createError(404, `Recipe with id ${req.params.recipeId} not found!`)
      );
    }
  } catch (error) {
    next(error);
  }
});
//Delete one of my recipies
usersRouter.delete(
  "/me/:recipeId",
  JWTAuthMiddleware,
  async (req, res, next) => {
    try {
      const updatedUser = await UsersModel.findByIdAndUpdate(
        req.user._id,
        { $pull: { recipeBook: req.params.recipeId } },
        { new: true, runValidators: true }
      );
      const recipeToDelete = await RecipesModel.findByIdAndDelete(
        req.params.recipeId
      );
      if (updatedUser && recipeToDelete) {
        res.send(updatedUser);
      } else {
        next(
          createHttpError(
            404,
            `Recipe with id ${req.params.recipeId} was not found`
          )
        );
      }
    } catch (error) {
      console.log(error);
      next(error);
    }
  }
);

export default usersRouter;
