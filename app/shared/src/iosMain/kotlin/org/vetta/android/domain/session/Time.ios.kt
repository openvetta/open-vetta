package org.vetta.android.domain.session

import platform.Foundation.NSDate
import platform.Foundation.timeIntervalSince1970

actual fun nowEpochMs(): Long = (NSDate().timeIntervalSince1970 * 1000.0).toLong()
