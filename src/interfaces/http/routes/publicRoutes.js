const express = require('express');

function buildPublicRoutes(publicController) {
  const router = express.Router();

  router.get('/', publicController.renderHome);
  router.get('/robots.txt', publicController.renderRobots);
  router.get('/sitemap.xml', publicController.renderSitemap);
  router.get('/about', publicController.renderAbout);
  router.get('/portfolio', publicController.renderPortfolio);
  router.get('/portfolio/:slug', publicController.renderPortfolioDetail);
  router.get('/service', publicController.renderService);
  router.get('/service/:slug', publicController.renderServiceDetail);
  router.get('/blog', publicController.renderBlog);
  router.get('/blog/:slug', publicController.renderBlogDetail);
  router.get('/contact', publicController.renderContact);
  router.post('/contact', publicController.submitContact);

  return router;
}

module.exports = buildPublicRoutes;
