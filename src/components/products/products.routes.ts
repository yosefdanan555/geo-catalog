import { Router } from 'express';
import { ProductsController } from './products.controller';

const router = Router();

// Request bodies and query params are validated against openapi.yaml by the
// express-openapi-validator middleware mounted in app.ts, ahead of this router.
router.post('/', ProductsController.create);
router.get('/', ProductsController.search);
router.get('/:id', ProductsController.getById);
router.put('/:id', ProductsController.update);
router.delete('/:id', ProductsController.remove);

export default router;
