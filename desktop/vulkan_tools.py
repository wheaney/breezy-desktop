# Copyright (C) 2019 by geehalel@gmail.com
# This code is licensed under the MIT license (MIT) (http://opensource.org/licenses/MIT)

import sys

import vulkan as vk


def physicalDeviceTypeString(devicetype):
    if devicetype == vk.VK_PHYSICAL_DEVICE_TYPE_OTHER:
        return 'OTHER'
    elif devicetype == vk.VK_PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU:
        return 'INTEGRATED_GPU'
    elif devicetype == vk.VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU:
        return 'DISCRETE_GPU'
    elif devicetype == vk.VK_PHYSICAL_DEVICE_TYPE_VIRTUAL_GPU:
        return 'VIRTUAL_GPU'
    else:
        return 'UNKNOWN_DEVICE_TYPE'

def getSupportedDepthFormat(physicalDevice):
    depthFormats = [
        vk.VK_FORMAT_D32_SFLOAT_S8_UINT,
        vk.VK_FORMAT_D32_SFLOAT,
        vk.VK_FORMAT_D24_UNORM_S8_UINT,
        vk.VK_FORMAT_D16_UNORM_S8_UINT,
        vk.VK_FORMAT_D16_UNORM
    ]
    for format in depthFormats:
        formatProps = vk.vkGetPhysicalDeviceFormatProperties(physicalDevice, format)
        if (formatProps.optimalTilingFeatures & vk.VK_FORMAT_FEATURE_DEPTH_STENCIL_ATTACHMENT_BIT):
            return format
    return None

def loadShader(filename, device):
    f = open(filename, 'rb')
    shaderCode = f.read()
    moduleCreateInfo = vk.VkShaderModuleCreateInfo(
        sType = vk.VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO,
        codeSize = len(shaderCode),
        pCode = shaderCode
    )
    shaderModule = vk.vkCreateShaderModule(device, moduleCreateInfo, None)
    return shaderModule

def setImageLayoutsubResource(cmdBuffer, image, oldImageLayout, newImageLayout,
                              subresourceRange, srcStageMask = vk.VK_PIPELINE_STAGE_ALL_COMMANDS_BIT, dstStageMask = vk.VK_PIPELINE_STAGE_ALL_COMMANDS_BIT):
    """
Create an image memory barrier for changing the layout of
an image and put it into an active command buffer
See chapter 11.4 "Image Layout" for details
    """
    imageMemoryBarrier = vk.VkImageMemoryBarrier(
        sType = vk.VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        srcQueueFamilyIndex = vk.VK_QUEUE_FAMILY_IGNORED,
        dstQueueFamilyIndex = vk.VK_QUEUE_FAMILY_IGNORED,
        oldLayout = oldImageLayout,
        newLayout = newImageLayout,
        image = image,
        subresourceRange = subresourceRange,
    )
    # Source layouts (old)
    # Source access mask controls actions that have to be finished on the old layout
    # before it will be transitioned to the new layout
    if oldImageLayout == vk.VK_IMAGE_LAYOUT_UNDEFINED:
        # Image layout is undefined (or does not matter)
        # Only valid as initial layout
        # No flags required, listed only for completeness
        imageMemoryBarrier.srcAccessMask = 0
    elif oldImageLayout == vk.VK_IMAGE_LAYOUT_PREINITIALIZED:
        # Image is preinitialized
        # Only valid as initial layout for linear images, preserves memory contents
        # Make sure host writes have been finished
        imageMemoryBarrier.srcAccessMask = vk.VK_ACCESS_HOST_WRITE_BIT
    elif oldImageLayout == vk.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL:
        # Image is a color attachment
        # Make sure any writes to the color buffer have been finished
        imageMemoryBarrier.srcAccessMask = vk.VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT
    elif oldImageLayout == vk.VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL:
        #Image is a depth/stencil attachment
        # Make sure any writes to the depth/stencil buffer have been finished
        imageMemoryBarrier.srcAccessMask = vk.VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT
    elif oldImageLayout == vk.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL:
        #Image is a transfer source
        # Make sure any reads from the image have been finished
        imageMemoryBarrier.srcAccessMask = vk.VK_ACCESS_TRANSFER_READ_BIT
    elif oldImageLayout == vk.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL:
        # Image is a transfer destination
        # Make sure any writes to the image have been finished
        imageMemoryBarrier.srcAccessMask = vk.VK_ACCESS_TRANSFER_WRITE_BIT
    elif oldImageLayout == vk.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL:
        # Image is read by a shader
        # Make sure any shader reads from the image have been finished
        imageMemoryBarrier.srcAccessMask = vk.VK_ACCESS_SHADER_READ_BIT
    else:
        #  Other source layouts aren't handled (yet)
        pass
    # Target layouts (new)
    # Destination access mask controls the dependency for the new image layout
    if newImageLayout == vk.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL:
        # Image will be used as a transfer destination
        # Make sure any writes to the image have been finished
        imageMemoryBarrier.dstAccessMask = vk.VK_ACCESS_TRANSFER_WRITE_BIT
    if newImageLayout == vk.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL:
        # Image will be used as a transfer source
        # Make sure any reads from the image have been finished
        imageMemoryBarrier.dstAccessMask = vk.VK_ACCESS_TRANSFER_READ_BIT
    if newImageLayout == vk.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL:
        # Image will be used as a color attachment
        # Make sure any writes to the color buffer have been finished
        imageMemoryBarrier.dstAccessMask = vk.VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT
    if newImageLayout == vk.VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL:
        # Image layout will be used as a depth/stencil attachment
        # Make sure any writes to depth/stencil buffer have been finished
        imageMemoryBarrier.dstAccessMask = imageMemoryBarrier.dstAccessMask | vk.VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT
    if newImageLayout == vk.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL:
        # Image will be read in a shader (sampler, input attachment)
        # Make sure any writes to the image have been finished
        if imageMemoryBarrier.srcAccessMask == 0:
            imageMemoryBarrier.srcAccessMask = vk.VK_ACCESS_HOST_WRITE_BIT | vk.VK_ACCESS_TRANSFER_WRITE_BIT
        imageMemoryBarrier.dstAccessMask = vk.VK_ACCESS_SHADER_READ_BIT
    else:
        #  Other source layouts aren't handled (yet)
        pass
    vk.vkCmdPipelineBarrier(cmdBuffer, srcStageMask, dstStageMask, 0, 0, None, 0, None, 1, imageMemoryBarrier)
# Fixed sub resource on first mip level and layer
def setImageLayout(cmdBuffer, image, aspectMask, oldImageLayout, newImageLayout, srcStageMask = vk.VK_PIPELINE_STAGE_ALL_COMMANDS_BIT, dstStageMask = vk.VK_PIPELINE_STAGE_ALL_COMMANDS_BIT):
    subresourceRange = vk.VkImageSubresourceRange(
        aspectMask = aspectMask,
        baseMipLevel = 0,
        levelCount = 1,
        layerCount = 1
    )
    setImageLayoutsubResource(cmdBuffer, image, oldImageLayout, newImageLayout, subresourceRange, srcStageMask, dstStageMask)

def exitFatal(message, exitCode):
    print(message + '(exit code ' + str(exitCode) +')')
    sys.exit(1)
