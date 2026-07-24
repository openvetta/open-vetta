package org.vetta.android.ui.media

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.ImageBitmap

actual fun imageBitmapFromBytes(bytes: ByteArray): ImageBitmap? = null

@Composable
actual fun rememberImagePicker(onPicked: (List<PickedImage>) -> Unit): () -> Unit =
    remember {
        { /* iOS picker 后续接入 */ }
    }
