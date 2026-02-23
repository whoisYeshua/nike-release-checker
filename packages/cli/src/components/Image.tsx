import { useEffect, useState } from 'react'
import { Text } from 'ink'
import terminalImage from 'terminal-image'

type ImageProps = {
	readonly src: ArrayBuffer | string
	readonly width?: number | string
	readonly height?: number | string
	readonly preserveAspectRatio?: boolean
}

export const Image = ({
	src,
	width = '100%',
	height = '100%',
	preserveAspectRatio = true,
}: ImageProps) => {
	const [imageData, setImageData] = useState('')

	useEffect(() => {
		;(async () => {
			let imageData
			if (src instanceof ArrayBuffer) {
				const buffer = Buffer.from(src)
				imageData = await terminalImage.buffer(buffer, { width, height, preserveAspectRatio })
			} else {
				imageData = await terminalImage.file(src, { width, height, preserveAspectRatio })
			}
			setImageData(imageData)
		})()
	}, [src, width, height, preserveAspectRatio])

	return <Text>{imageData}</Text>
}
