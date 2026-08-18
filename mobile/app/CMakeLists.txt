cmake_minimum_required(VERSION 3.22.1)

project(syncwatch_mobile_server LANGUAGES CXX)

if(NOT DEFINED NODEJS_MOBILE_ROOT OR NOT EXISTS "${NODEJS_MOBILE_ROOT}/include/node/node.h")
    message(FATAL_ERROR "NODEJS_MOBILE_ROOT must point to the extracted Node.js Mobile Android SDK")
endif()

add_library(node SHARED IMPORTED)
set_target_properties(node PROPERTIES
        IMPORTED_LOCATION "${NODEJS_MOBILE_ROOT}/bin/${ANDROID_ABI}/libnode.so")

add_library(syncwatch-node SHARED
        src/main/cpp/native-node.cpp)

target_include_directories(syncwatch-node PRIVATE
        "${NODEJS_MOBILE_ROOT}/include/node")

find_library(android-log log)

target_compile_features(syncwatch-node PRIVATE cxx_std_17)
target_compile_options(syncwatch-node PRIVATE -Wall -Wextra -Werror=return-type)
target_link_libraries(syncwatch-node PRIVATE node ${android-log})
