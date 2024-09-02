const jsonServer = require('json-server');
const multer = require('multer');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const server = jsonServer.create();
const router = jsonServer.router('db.json');
const middlewares = jsonServer.defaults();

// Configurar Cloudinary
cloudinary.config({
    url: process.env.CLOUDINARY_URL
});

// Configuración para la carga de archivos
const upload = multer({ dest: 'uploads/' });

// Reescritura de URL para las rutas de la API
server.use(jsonServer.rewriter({
    '/api/posts/:id': '/posts/:id',
    '/api/users/:id': '/users/:id',
    '/api/users/:id/follow': '/users/:id/follow',
    '/api/users/:id/unfollow': '/users/:id/unfollow',
    '/api/posts/:id/like': '/posts/:id/like',
    '/api/posts/:id/unlike': '/posts/:id/unlike',
    '/api/posts/:id/comments': '/posts/:id/comments',
    '/api/mediaTypes/:id': '/mediaTypes/:id',
    '/api/posts': '/posts',
    '/api/users': '/users',
    '/api/mediaTypes': '/mediaTypes',
    '/api/*': '/$1',
    '/product/:resource/:id/show': '/:resource/:id'
}));

// Middleware para verificar la propiedad del post
const checkPostOwnership = (req, res, next) => {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) return res.status(400).json({ message: 'Se requiere userId para verificar la propiedad' });

    const post = router.db.get('posts').find({ id: parseInt(id) }).value();

    if (post && post.userId === userId) {
        next();
    } else {
        res.status(403).json({ message: 'No tienes permiso para modificar este post' });
    }
};

// Middleware para verificar la existencia del usuario
const checkUserExistence = (req, res, next) => {
    const { username, email } = req.body;
    const user = router.db.get('users')
        .find(user => user.email === email || user.username === username)
        .value();

    if (user) {
        req.user = user;
        next();
    } else {
        res.status(404).json({ message: 'Usuario no encontrado' });
    }
};

// Middleware para verificar la autenticación del usuario
const authenticateUser = (req, res, next) => {
    const { username, email, password } = req.body;
    const user = router.db.get('users')
        .find(user => (user.email === email || user.username === username) && user.password === password)
        .value();

    if (user) {
        req.user = user;
        next();
    } else {
        res.status(401).json({ message: 'Credenciales inválidas' });
    }
};

// Función para manejar la carga y procesamiento de imágenes
const handleImageUpload = async (filePath, width, height) => {
    const buffer = await sharp(filePath)
        .resize({ width, height, fit: 'cover' })
        .toBuffer();
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
            if (error) return reject(error);
            resolve(result.secure_url);
        }).end(buffer);
    });
};

// Ruta para actualizar la imagen de perfil
server.post('/users/:id/updateProfilePicture', upload.single('profilePicture'), async (req, res) => {
    const { id } = req.params;
    const { file } = req;

    if (!file) return res.status(400).json({ message: 'Se requiere un archivo para actualizar la imagen de perfil' });

    try {
        const profilePictureUrl = await handleImageUpload(file.path, 200, 200);
        fs.unlink(file.path, () => { });

        const user = router.db.get('users').find({ id: parseInt(id) }).value();
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

        user.profilePicture = profilePictureUrl;
        router.db.get('users').find({ id: parseInt(id) }).assign(user).write();
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: 'Error al procesar la imagen' });
    }
});

// Ruta para actualizar la imagen de banner
server.post('/users/:id/updateBannerPicture', upload.single('bannerPicture'), async (req, res) => {
    const { id } = req.params;
    const { file } = req;

    if (!file) return res.status(400).json({ message: 'Se requiere un archivo para actualizar la imagen de banner' });

    try {
        const bannerPictureUrl = await handleImageUpload(file.path, 1200, 400);
        fs.unlink(file.path, () => { });

        const user = router.db.get('users').find({ id: parseInt(id) }).value();
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

        user.bannerPicture = bannerPictureUrl;
        router.db.get('users').find({ id: parseInt(id) }).assign(user).write();
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: 'Error al procesar la imagen' });
    }
});

// Ruta para crear un nuevo usuario
server.post('/users', (req, res) => {
    const { username, email, password } = req.body;

    const existingUser = router.db.get('users').find({ email }).value() || router.db.get('users').find({ username }).value();

    if (existingUser) return res.status(400).json({ message: 'El usuario ya existe' });

    const newUser = {
        id: Date.now(),
        username,
        email,
        password,
        profilePicture: "",
        bannerPicture: "",
        followers: [],
        following: [],
        posts: [],
        likes: 0,
        tags: [],
    };

    router.db.get('users').push(newUser).write();
    res.status(201).json(newUser);
});

// Ruta para iniciar sesión (login)
server.post('/login', authenticateUser, (req, res) => {
    res.status(200).json(req.user);
});

// Ruta para seguir a un usuario
server.post('/users/:id/follow', (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    const userToFollow = router.db.get('users').find({ id: parseInt(id) }).value();
    const currentUser = router.db.get('users').find({ id: userId }).value();

    if (!userToFollow || !currentUser) return res.status(404).json({ message: 'Usuario no encontrado' });

    if (userToFollow.followers.includes(userId)) return res.status(400).json({ message: 'Ya sigues a este usuario' });

    userToFollow.followers.push(userId);
    currentUser.following.push(id);

    router.db.get('users').find({ id: parseInt(id) }).assign({ followers: userToFollow.followers }).write();
    router.db.get('users').find({ id: userId }).assign({ following: currentUser.following }).write();

    res.status(200).json({ message: 'Usuario seguido correctamente' });
});

// Ruta para dejar de seguir a un usuario
server.post('/users/:id/unfollow', (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    const userToUnfollow = router.db.get('users').find({ id: parseInt(id) }).value();
    const currentUser = router.db.get('users').find({ id: userId }).value();

    if (!userToUnfollow || !currentUser) return res.status(404).json({ message: 'Usuario no encontrado' });

    if (!userToUnfollow.followers.includes(userId)) return res.status(400).json({ message: 'No estás siguiendo a este usuario' });

    userToUnfollow.followers = userToUnfollow.followers.filter(followerId => followerId !== userId);
    currentUser.following = currentUser.following.filter(followingId => followingId !== id);

    router.db.get('users').find({ id: parseInt(id) }).assign({ followers: userToUnfollow.followers }).write();
    router.db.get('users').find({ id: userId }).assign({ following: currentUser.following }).write();

    res.status(200).json({ message: 'Usuario dejado de seguir correctamente' });
});

// Ruta para dar like a una publicación
server.post('/posts/:id/like', (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    const post = router.db.get('posts').find({ id: parseInt(id) }).value();
    const user = router.db.get('users').find({ id: userId }).value();

    if (!post || !user) return res.status(404).json({ message: 'Post o usuario no encontrado' });

    if (post.likes.includes(userId)) return res.status(400).json({ message: 'Ya has dado like a este post' });

    post.likes.push(userId);
    router.db.get('posts').find({ id: parseInt(id) }).assign({ likes: post.likes }).write();
    res.status(200).json({ message: 'Like dado correctamente' });
});

// Ruta para quitar el like de una publicación
server.post('/posts/:id/unlike', (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    const post = router.db.get('posts').find({ id: parseInt(id) }).value();
    const user = router.db.get('users').find({ id: userId }).value();

    if (!post || !user) return res.status(404).json({ message: 'Post o usuario no encontrado' });

    if (!post.likes.includes(userId)) return res.status(400).json({ message: 'No has dado like a este post' });

    post.likes = post.likes.filter(like => like !== userId);
    router.db.get('posts').find({ id: parseInt(id) }).assign({ likes: post.likes }).write();
    res.status(200).json({ message: 'Like quitado correctamente' });
});

// Ruta para comentar en una publicación
server.post('/posts/:id/comments', (req, res) => {
    const { id } = req.params;
    const { userId, comment } = req.body;

    if (!comment) return res.status(400).json({ message: 'Comentario requerido' });

    const post = router.db.get('posts').find({ id: parseInt(id) }).value();
    const user = router.db.get('users').find({ id: userId }).value();

    if (!post || !user) return res.status(404).json({ message: 'Post o usuario no encontrado' });

    const newComment = {
        id: Date.now(),
        userId,
        comment,
        timestamp: new Date().toISOString()
    };

    post.comments.push(newComment);
    router.db.get('posts').find({ id: parseInt(id) }).assign({ comments: post.comments }).write();
    res.status(201).json(newComment);
});

// Usar los middlewares y enrutadores
server.use(middlewares);
server.use(router);

// Iniciar el servidor
server.listen(3000, () => {
    console.log('JSON Server is running on port 3000');
});
