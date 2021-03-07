const formateData = data => {
    const products = []
    data.forEach(release => {
        const slug = {
            slug: release.publishedContent.properties.seo.slug,
            title: release.publishedContent.properties.coverCard.properties.title,
            models: [],
        }

        release.productInfo.forEach(product => {
            const model = {
                modelName: product.merchProduct.labelName,
                id: product.merchProduct.id,
                imageURL: product.imageUrls.productImageUrl,
                sizes: [],
                stock: [],
            }

            product.skus.forEach(sizeId => {
                const size = {}
                const validSizeFormat = sizeId.nikeSize.replace('.', '_')
                size[validSizeFormat] = sizeId.id
                model.sizes.push(size)
            })

            product.availableSkus.forEach(skuStock => {
                const stock = {}
                stock[skuStock.skuId] = skuStock.level
                model.stock.push(stock)
            })
            slug.models.push(model)
        })
        products.push(slug)
    })
    return products
}

module.exports = { formateData }
