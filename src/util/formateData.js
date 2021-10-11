const formateData = data => {
  const products = []
  for (const release of data) {
    const slug = {
      slug: release.publishedContent.properties.seo.slug,
      title: release.publishedContent.properties.coverCard.properties.title,
      models: [],
    }

    for (const product of release.productInfo) {
      const model = {
        modelName: product.merchProduct.labelName,
        id: product.merchProduct.id,
        imageURL: product.imageUrls.productImageUrl,
        sizes: [],
        stock: [],
      }

      for (const sizeId of product.skus) {
        const size = {}
        const validSizeFormat = sizeId.nikeSize.replace('.', '_')
        size[validSizeFormat] = sizeId.id
        model.sizes.push(size)
      }

      for (const skuStock of product.availableSkus) {
        const stock = {}
        stock[skuStock.skuId] = skuStock.level
        model.stock.push(stock)
      }
      slug.models.push(model)
    }
    products.push(slug)
  }
  return products
}

module.exports = { formateData }
