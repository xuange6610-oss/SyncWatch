#include <jni.h>

#include <android/log.h>
#include <node.h>

#include <cstring>
#include <string>
#include <vector>

namespace {
constexpr const char* kLogTag = "SyncWatchNode";
}

extern "C" JNIEXPORT jint JNICALL
Java_com_xuan_syncwatch_MobileServerService_nativeStartNode(
        JNIEnv* env,
        jclass,
        jobjectArray arguments) {
    if (arguments == nullptr) {
        __android_log_print(ANDROID_LOG_ERROR, kLogTag, "Node argument array was null");
        return -1;
    }

    const jsize argument_count = env->GetArrayLength(arguments);
    if (argument_count <= 0) {
        __android_log_print(ANDROID_LOG_ERROR, kLogTag, "Node argument array was empty");
        return -2;
    }

    std::vector<std::string> copied_arguments;
    copied_arguments.reserve(static_cast<size_t>(argument_count));
    size_t buffer_size = 0;

    for (jsize index = 0; index < argument_count; ++index) {
        auto value = static_cast<jstring>(env->GetObjectArrayElement(arguments, index));
        if (value == nullptr) {
            copied_arguments.emplace_back();
        } else {
            const char* utf8 = env->GetStringUTFChars(value, nullptr);
            if (utf8 == nullptr) {
                env->DeleteLocalRef(value);
                return -3;
            }
            copied_arguments.emplace_back(utf8);
            env->ReleaseStringUTFChars(value, utf8);
            env->DeleteLocalRef(value);
        }
        buffer_size += copied_arguments.back().size() + 1;
    }

    std::vector<char> contiguous_arguments(buffer_size, '\0');
    std::vector<char*> argv(static_cast<size_t>(argument_count), nullptr);
    char* write_position = contiguous_arguments.data();

    for (jsize index = 0; index < argument_count; ++index) {
        const std::string& argument = copied_arguments[static_cast<size_t>(index)];
        std::memcpy(write_position, argument.data(), argument.size());
        argv[static_cast<size_t>(index)] = write_position;
        write_position += argument.size() + 1;
    }

    __android_log_print(ANDROID_LOG_INFO, kLogTag,
                        "Starting embedded Node.js with %d arguments", argument_count);
    const int result = node::Start(static_cast<int>(argument_count), argv.data());
    __android_log_print(ANDROID_LOG_INFO, kLogTag,
                        "Embedded Node.js stopped with exit code %d", result);
    return static_cast<jint>(result);
}
