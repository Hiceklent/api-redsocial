// See https://github.com/typicode/json-server#module
const jsonServer = require('json-server');
const server = jsonServer.create();
const router = jsonServer.router('db.json');
const middlewares = jsonServer.defaults();

server.use(middlewares);

// URL Rewriting for API routes
server.use(jsonServer.rewriter({
    '/api/*': '/$1',
    '/product/:resource/:id/show': '/:resource/:id'
}));

// Middleware to check post ownership
const checkPostOwnership = (req, res, next) => {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ message: 'Se requiere userId para verificar la propiedad' });
    }

    const post = router.db.get('posts').find({ id: parseInt(id) }).value();

    if (post && post.userId === userId) {
        next();
    } else {
        res.status(403).json({ message: 'No tienes permiso para modificar este post' });
    }
};

// Route to update a post
server.put('/posts/:id', checkPostOwnership, (req, res) => {
    const { id } = req.params;
    const { userId, ...postUpdates } = req.body;

    const post = router.db.get('posts').find({ id: parseInt(id) }).value();

    if (post) {
        router.db.get('posts').find({ id: parseInt(id) }).assign(postUpdates).write();
        res.status(200).json({ message: 'Publicación actualizada correctamente' });
    } else {
        res.status(404).json({ message: 'Publicación no encontrada' });
    }
});

// Route to delete a post
server.delete('/posts/:id', checkPostOwnership, (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    const post = router.db.get('posts').find({ id: parseInt(id) }).value();

    if (post) {
        router.db.get('posts').remove({ id: parseInt(id) }).write();
        res.status(200).json({ message: 'Publicación eliminada correctamente' });
    } else {
        res.status(404).json({ message: 'Publicación no encontrada' });
    }
});

server.use(router);

server.listen(3000, () => {
    console.log('JSON Server is running on port 3000');
});

// Export the Server API
module.exports = server;
