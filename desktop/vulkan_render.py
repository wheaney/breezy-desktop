import ctypes
import os

from vulkan import *
import vulkan_tools

import glfw

# todo - look into VK_KHR_display and VK_KHR_display_swapchain extensions to get rid of glfw dependency

WIDTH = 1920
HEIGHT = 1080

validationLayers = ["VK_LAYER_KHRONOS_validation"]
deviceExtensions = [VK_KHR_SWAPCHAIN_EXTENSION_NAME]

enableValidationLayers = False


def debugCallback(*args):
    print('DEBUG: {} {}'.format(args[5], args[6]))
    return 0

def createDebugReportCallbackEXT(instance, pCreateInfo, pAllocator):
    func = vkGetInstanceProcAddr(instance, 'vkCreateDebugReportCallbackEXT')
    if func:
        return func(instance, pCreateInfo, pAllocator)
    else:
        return VK_ERROR_EXTENSION_NOT_PRESENT

def destroyDebugReportCallbackEXT(instance, callback, pAllocator):
    func = vkGetInstanceProcAddr(instance, 'vkDestroyDebugReportCallbackEXT')
    if func:
        func(instance, callback, pAllocator)

def destroySurface(instance, surface, pAllocator=None):
    func = vkGetInstanceProcAddr(instance, 'vkDestroySurfaceKHR')
    if func:
        func(instance, surface, pAllocator)

def destroySwapChain(device, swapChain, pAllocator=None):
    func = vkGetDeviceProcAddr(device, 'vkDestroySwapchainKHR')
    if func:
        func(device, swapChain, pAllocator)


class QueueFamilyIndices(object):

    def __init__(self):
        self.graphicsFamily = -1
        self.presentFamily = -1

    def isComplete(self):
        return self.graphicsFamily >= 0 and self.presentFamily >= 0


class SwapChainSupportDetails(object):
    def __init__(self):
        self.capabilities = None
        self.formats = None
        self.presentModes = None

class BreezyDesktopVulkanApp(object):

    def __init__(self):
        self.__window = None
        self.__instance = None
        self.__callback = None
        self.__surface = None
        self.__physicalDevice = None
        self.__device = None
        self.__graphicsQueue = None
        self.__presentQueue = None

        self.__swapChain = None
        self.__swapChainImages = None
        self.__swapChainImageFormat = None
        self.__swapChainExtent = None

        self.__swapChainImageViews = None
        self.__swapChainFramebuffers = None

        self.__renderPass = None
        self.__pipelineLayout = None
        self.__graphicsPipeline = None

        self.__descriptorSetLayout = None
        self.__descriptorPool = None
        self.__descriptorSets = None
        self.__uniformBuffers = None

        self.__commandPool = None
        self.__commandBuffers = None

        self.__imageAvailableSemaphores = []
        self.__renderFinishedSemaphores = []
        self.__inFlightFences = []

        self.__textureImage = None
        self.__textureImageView = None
        self.__textureImageMemory = None
        self.__textureSampler = None

        self.__maxFramesInFlight = 2
        self.__currentFrame = 0

    def __del__(self):
        vkDeviceWaitIdle(self.__device)

        if self.__inFlightFences:
            for i in self.__inFlightFences:
                vkDestroyFence(self.__device, i, None)

        if self.__imageAvailableSemaphores:
            for i in self.__imageAvailableSemaphores:
                vkDestroySemaphore(self.__device, i, None)

        if self.__renderFinishedSemaphores:
            for i in self.__renderFinishedSemaphores:
                vkDestroySemaphore(self.__device, i, None)

        if self.__commandBuffers:
            self.__commandBuffers = None

        if self.__commandPool:
            vkDestroyCommandPool(self.__device, self.__commandPool, None)

        if self.__swapChainFramebuffers:
            for i in self.__swapChainFramebuffers:
                vkDestroyFramebuffer(self.__device, i, None)
            self.__swapChainFramebuffers = None

        if self.__uniformBuffers:
            for i in self.__uniformBuffers:
                vkDestroyBuffer(self.__device, i, None)
            self.__uniformBuffers = None

        if self.__descriptorSets:
            for i in self.__descriptorSets:
                vkFreeDescriptorSets(self.__device, self.__descriptorPool, 1, i)
            self.__descriptorSets = None

        if self.__descriptorPool:
            vkDestroyDescriptorPool(self.__device, self.__descriptorPool, None)

        if self.__descriptorSetLayout:
            vkDestroyDescriptorSetLayout(self.__device, self.__descriptorSetLayout, None)

        if self.__renderPass:
            vkDestroyRenderPass(self.__device, self.__renderPass, None)

        if self.__pipelineLayout:
            vkDestroyPipelineLayout(self.__device, self.__pipelineLayout, None)

        if self.__graphicsPipeline:
            vkDestroyPipeline(self.__device, self.__graphicsPipeline, None)

        if self.__swapChainImageViews:
            for i in self.__swapChainImageViews:
                vkDestroyImageView(self.__device, i, None)

        if self.__textureSampler:
            vkDestroySampler(self.__device, self.__textureSampler, None)

        if self.__textureImageView:
            vkDestroyImageView(self.__device, self.__textureImageView, None)

        if self.__textureImage:
            vkDestroyImage(self.__device, self.__textureImage, None)

        if self.__textureImageMemory:
            vkFreeMemory(self.__device, self.__textureImageMemory, None)

        if self.__swapChain:
            destroySwapChain(self.__device, self.__swapChain, None)

        if self.__device:
            vkDestroyDevice(self.__device, None)

        if self.__surface:
            destroySurface(self.__instance, self.__surface, None)

        if self.__callback:
            destroyDebugReportCallbackEXT(self.__instance, self.__callback, None)

        if self.__instance:
            vkDestroyInstance(self.__instance, None)

    def __initWindow(self):
        glfw.init()

        glfw.window_hint(glfw.CLIENT_API, glfw.NO_API)
        glfw.window_hint(glfw.RESIZABLE, False)

        self.__window = glfw.create_window(WIDTH, HEIGHT, "Vulkan", None, None)

    def __initVulkan(self):
        self.__createInstance()
        self.__setupDebugCallback()
        self.__createSurface()
        self.__pickPhysicalDevice()
        self.__createLogicalDevice()
        self.__createSwapChain()
        self.__createImageViews()
        self.__createRenderPass()
        self.__createGraphicsPipeline()
        self.__createUniformBuffers()
        # self.__createDescriptorSetLayout()
        # self.__createDescriptorPool()
        self.__createFramebuffers()
        self.__createCommandPool()
        # self.__createDescriptorSets()
        self.__createCommandBuffers()
        self.__createSemaphores()
        # self.__createTextureImage()
        # self.__createTextureImageView()
        # self.__createTextureSampler()
        # self.__createVertexBuffer()

    def __mainLoop(self):
        while not glfw.window_should_close(self.__window):
            glfw.poll_events()
            self.__drawFrame()

        vkDeviceWaitIdle(self.__device)

    def __createInstance(self):
        if enableValidationLayers and not self.__checkValidationLayerSupport():
            raise Exception("validation layers requested, but not available!")

        appInfo = VkApplicationInfo(
            sType=VK_STRUCTURE_TYPE_APPLICATION_INFO,
            pApplicationName='Breezy Desktop',
            applicationVersion=VK_MAKE_VERSION(1, 0, 0),
            pEngineName='No Engine',
            engineVersion=VK_MAKE_VERSION(1, 0, 0),
            apiVersion=VK_MAKE_VERSION(1, 0, 3)
        )

        createInfo = None
        extensions = self.__getRequiredExtensions()

        if enableValidationLayers:
            createInfo = VkInstanceCreateInfo(
                sType=VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO,
                pApplicationInfo=appInfo,
                enabledExtensionCount=len(extensions),
                ppEnabledExtensionNames=extensions,
                enabledLayerCount=len(validationLayers),
                ppEnabledLayerNames=validationLayers
            )
        else:
            createInfo = VkInstanceCreateInfo(
                sType=VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO,
                pApplicationInfo=appInfo,
                enabledExtensionCount=len(extensions),
                ppEnabledExtensionNames=extensions,
                enabledLayerCount=0
            )

        self.__instance = vkCreateInstance(createInfo, None)

    def __setupDebugCallback(self):
        if not enableValidationLayers:
            return

        createInfo = VkDebugReportCallbackCreateInfoEXT(
            sType=VK_STRUCTURE_TYPE_DEBUG_REPORT_CALLBACK_CREATE_INFO_EXT,
            flags=VK_DEBUG_REPORT_ERROR_BIT_EXT | VK_DEBUG_REPORT_WARNING_BIT_EXT,
            pfnCallback=debugCallback
        )
        self.__callback = createDebugReportCallbackEXT(self.__instance, createInfo, None)
        if not self.__callback:
            raise Exception("failed to set up debug callback!")

    def __createSurface(self):
        surface_ptr = ffi.new('VkSurfaceKHR[1]')
        glfw.create_window_surface(self.__instance, self.__window, None, surface_ptr)
        self.__surface = surface_ptr[0]
        if self.__surface is None:
            raise Exception("failed to create window surface!")

    def __pickPhysicalDevice(self):
        devices = vkEnumeratePhysicalDevices(self.__instance)

        for device in devices:
            if self.__isDeviceSuitable(device):
                self.__physicalDevice = device
                break

        if self.__physicalDevice is None:
            raise Exception("failed to find a suitable GPU!")

    def __createLogicalDevice(self):
        indices = self.__findQueueFamilies(self.__physicalDevice)
        uniqueQueueFamilies = {}.fromkeys((indices.graphicsFamily, indices.presentFamily))
        queueCreateInfos = []
        for queueFamily in uniqueQueueFamilies:
            queueCreateInfo = VkDeviceQueueCreateInfo(
                sType=VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO,
                queueFamilyIndex=queueFamily,
                queueCount=1,
                pQueuePriorities=[1.0]
            )
            queueCreateInfos.append(queueCreateInfo)

        deviceFeatures = VkPhysicalDeviceFeatures(
            samplerAnisotropy=True
        )

        createInfo = None
        if enableValidationLayers:
            createInfo = VkDeviceCreateInfo(
                sType=VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO,
                flags=0,
                pQueueCreateInfos=queueCreateInfos,
                queueCreateInfoCount=len(queueCreateInfos),
                pEnabledFeatures=[deviceFeatures],
                enabledExtensionCount=len(deviceExtensions),
                ppEnabledExtensionNames=deviceExtensions,
                enabledLayerCount=len(validationLayers),
                ppEnabledLayerNames=validationLayers
            )
        else:
            createInfo = VkDeviceCreateInfo(
                sType=VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO,
                flags=0,
                pQueueCreateInfos=queueCreateInfos,
                queueCreateInfoCount=len(queueCreateInfos),
                pEnabledFeatures=[deviceFeatures],
                enabledExtensionCount=len(deviceExtensions),
                ppEnabledExtensionNames=deviceExtensions,
                enabledLayerCount=0
            )

        self.__device = vkCreateDevice(self.__physicalDevice, createInfo, None)
        if self.__device is None:
            raise Exception("failed to create logical device!")
        self.__graphicsQueue = vkGetDeviceQueue(self.__device, indices.graphicsFamily, 0)
        self.__presentQueue = vkGetDeviceQueue(self.__device, indices.presentFamily, 0)

    def __createSwapChain(self):
        swapChainSupport = self.__querySwapChainSupport(self.__physicalDevice)

        surfaceFormat = self.__chooseSwapSurfaceFormat(swapChainSupport.formats)
        presentMode = self.__chooseSwapPresentMode(swapChainSupport.presentModes)
        extent = self.__chooseSwapExtent(swapChainSupport.capabilities)

        imageCount = swapChainSupport.capabilities.minImageCount + 1
        if swapChainSupport.capabilities.maxImageCount > 0 and imageCount > swapChainSupport.capabilities.maxImageCount:
            imageCount = swapChainSupport.capabilities.maxImageCount

        createInfo = VkSwapchainCreateInfoKHR(
            sType=VK_STRUCTURE_TYPE_SWAPCHAIN_CREATE_INFO_KHR,
            flags=0,
            surface=self.__surface,
            minImageCount=imageCount,
            imageFormat=surfaceFormat.format,
            imageColorSpace=surfaceFormat.colorSpace,
            imageExtent=extent,
            imageArrayLayers=1,
            imageUsage=VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT
        )

        indices = self.__findQueueFamilies(self.__physicalDevice)
        if indices.graphicsFamily != indices.presentFamily:
            createInfo.imageSharingMode = VK_SHARING_MODE_CONCURRENT
            createInfo.queueFamilyIndexCount = 2
            createInfo.pQueueFamilyIndices = [indices.graphicsFamily, indices.presentFamily]
        else:
            createInfo.imageSharingMode = VK_SHARING_MODE_EXCLUSIVE

        createInfo.preTransform = swapChainSupport.capabilities.currentTransform
        createInfo.compositeAlpha = VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR
        createInfo.presentMode = presentMode
        createInfo.clipped = True

        vkCreateSwapchainKHR = vkGetDeviceProcAddr(self.__device, 'vkCreateSwapchainKHR')
        self.__swapChain = vkCreateSwapchainKHR(self.__device, createInfo, None)

        vkGetSwapchainImagesKHR = vkGetDeviceProcAddr(self.__device, 'vkGetSwapchainImagesKHR')
        self.__swapChainImages = vkGetSwapchainImagesKHR(self.__device, self.__swapChain)

        self.__swapChainImageFormat = surfaceFormat.format
        self.__swapChainExtent = extent

    def __createImageViews(self):
        self.__swapChainImageViews = []

        for image in self.__swapChainImages:
            self.__swapChainImageViews.append(self.__createImageView(image, self.__swapChainImageFormat))

    def __createRenderPass(self):
        colorAttachment = VkAttachmentDescription(
            format=self.__swapChainImageFormat,
            samples=VK_SAMPLE_COUNT_1_BIT,
            loadOp=VK_ATTACHMENT_LOAD_OP_CLEAR,
            storeOp=VK_ATTACHMENT_STORE_OP_STORE,
            stencilLoadOp=VK_ATTACHMENT_LOAD_OP_DONT_CARE,
            stencilStoreOp=VK_ATTACHMENT_STORE_OP_DONT_CARE,
            initialLayout=VK_IMAGE_LAYOUT_UNDEFINED,
            finalLayout=VK_IMAGE_LAYOUT_PRESENT_SRC_KHR
        )

        colorAttachmentRef = VkAttachmentReference(
            attachment=0,
            layout=VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL
        )

        dependency = VkSubpassDependency(
            srcSubpass=VK_SUBPASS_EXTERNAL,
            dstSubpass=0,
            srcStageMask=VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT,
            srcAccessMask=0,
            dstStageMask=VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT,
            dstAccessMask=VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT,
        )

        subPass = VkSubpassDescription(
            pipelineBindPoint=VK_PIPELINE_BIND_POINT_GRAPHICS,
            colorAttachmentCount=1,
            pColorAttachments=colorAttachmentRef
        )

        renderPassInfo = VkRenderPassCreateInfo(
            sType=VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO,
            attachmentCount=1,
            pAttachments=colorAttachment,
            subpassCount=1,
            pSubpasses=subPass,
            dependencyCount=1,
            pDependencies=[dependency]
        )

        self.__renderPass = vkCreateRenderPass(self.__device, renderPassInfo, None)

    def __createGraphicsPipeline(self):
        path = os.path.dirname(os.path.abspath(__file__))
        vertShaderModule = self.__createShaderModule(os.path.join(path, 'shaders/hello_triangle_vert.spv'))
        fragShaderModule = self.__createShaderModule(os.path.join(path, 'shaders/hello_triangle_frag.spv'))

        vertShaderStageInfo = VkPipelineShaderStageCreateInfo(
            sType=VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO,
            flags=0,
            stage=VK_SHADER_STAGE_VERTEX_BIT,
            module=vertShaderModule,
            pName='main'
        )

        fragShaderStageInfo = VkPipelineShaderStageCreateInfo(
            sType=VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO,
            flags=0,
            stage=VK_SHADER_STAGE_FRAGMENT_BIT,
            module=fragShaderModule,
            pName='main'
        )

        shaderStages = [vertShaderStageInfo, fragShaderStageInfo]

        vertexInputInfo = VkPipelineVertexInputStateCreateInfo(
            sType=VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO,
            vertexBindingDescriptionCount=0,
            vertexAttributeDescriptionCount=0
        )

        inputAssembly = VkPipelineInputAssemblyStateCreateInfo(
            sType=VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO,
            topology=VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST,
            primitiveRestartEnable=False
        )

        viewport = VkViewport(0.0, 0.0,
                              float(self.__swapChainExtent.width),
                              float(self.__swapChainExtent.height),
                              0.0, 1.0)
        scissor = VkRect2D([0, 0], self.__swapChainExtent)
        viewportState = VkPipelineViewportStateCreateInfo(
            sType=VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO,
            viewportCount=1,
            pViewports=viewport,
            scissorCount=1,
            pScissors=scissor
        )

        rasterizer = VkPipelineRasterizationStateCreateInfo(
            sType=VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO,
            depthClampEnable=False,
            rasterizerDiscardEnable=False,
            polygonMode=VK_POLYGON_MODE_FILL,
            lineWidth=1.0,
            cullMode=VK_CULL_MODE_BACK_BIT,
            frontFace=VK_FRONT_FACE_CLOCKWISE,
            depthBiasEnable=False
        )

        multisampling = VkPipelineMultisampleStateCreateInfo(
            sType=VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO,
            sampleShadingEnable=False,
            rasterizationSamples=VK_SAMPLE_COUNT_1_BIT
        )

        colorBlendAttachment = VkPipelineColorBlendAttachmentState(
            colorWriteMask=VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT | VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT,
            blendEnable=False
        )

        colorBlending = VkPipelineColorBlendStateCreateInfo(
            sType=VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO,
            logicOpEnable=False,
            logicOp=VK_LOGIC_OP_COPY,
            attachmentCount=1,
            pAttachments=colorBlendAttachment,
            blendConstants=[0.0, 0.0, 0.0, 0.0]
        )

        pipelineLayoutInfo = VkPipelineLayoutCreateInfo(
            sType=VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO,
            setLayoutCount=0,
            pushConstantRangeCount=0
        )

        self.__pipelineLayout = vkCreatePipelineLayout(self.__device, pipelineLayoutInfo, None)

        pipelineInfo = VkGraphicsPipelineCreateInfo(
            sType=VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO,
            stageCount=2,
            pStages=shaderStages,
            pVertexInputState=vertexInputInfo,
            pInputAssemblyState=inputAssembly,
            pViewportState=viewportState,
            pRasterizationState=rasterizer,
            pMultisampleState=multisampling,
            pDepthStencilState=None,
            pColorBlendState=colorBlending,
            pDynamicState=None,
            layout=self.__pipelineLayout,
            renderPass=self.__renderPass,
            subpass=0
        )

        self.__graphicsPipeline = vkCreateGraphicsPipelines(self.__device, VK_NULL_HANDLE, 1, pipelineInfo, None)[0]

        vkDestroyShaderModule(self.__device, vertShaderModule, None)
        vkDestroyShaderModule(self.__device, fragShaderModule, None)

    def __createUniformBuffers(self):
        bufferSize = ctypes.sizeof(ctypes.c_uint64) * 3
        self.__uniformBuffers = []

        for i in range(len(self.__swapChainImages)):
            buffer = VkBufferCreateInfo(
                sType=VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO,
                size=bufferSize,
                usage=VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT,
                sharingMode=VK_SHARING_MODE_EXCLUSIVE
            )
            self.__uniformBuffers.append(vkCreateBuffer(self.__device, buffer, None))

            memReqs = vkGetBufferMemoryRequirements(self.__device, self.__uniformBuffers[i])

            allocInfo = VkMemoryAllocateInfo(
                sType=VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
                allocationSize=memReqs.size,
                memoryTypeIndex=self.__findMemoryType(memReqs.memoryTypeBits, VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT)
            )
            memory = vkAllocateMemory(self.__device, allocInfo, None)
            vkBindBufferMemory(self.__device, self.__uniformBuffers[i], memory, 0)

    def __createFramebuffers(self):
        self.__swapChainFramebuffers = []

        for imageView in self.__swapChainImageViews:
            attachments = [imageView,]

            framebufferInfo = VkFramebufferCreateInfo(
                sType=VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO,
                renderPass=self.__renderPass,
                attachmentCount=1,
                pAttachments=attachments,
                width=self.__swapChainExtent.width,
                height=self.__swapChainExtent.height,
                layers=1
            )
            framebuffer = vkCreateFramebuffer(self.__device, framebufferInfo, None)
            self.__swapChainFramebuffers.append(framebuffer)

    def __createCommandPool(self):
        queueFamilyIndices = self.__findQueueFamilies(self.__physicalDevice)

        poolInfo = VkCommandPoolCreateInfo(
            sType=VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO,
            flags=VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT,
            queueFamilyIndex=queueFamilyIndices.graphicsFamily
        )

        self.__commandPool = vkCreateCommandPool(self.__device, poolInfo, None)

    def __createCommandBuffers(self):
        allocInfo = VkCommandBufferAllocateInfo(
            sType=VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO,
            commandPool=self.__commandPool,
            level=VK_COMMAND_BUFFER_LEVEL_PRIMARY,
            commandBufferCount=len(self.__swapChainFramebuffers)
        )

        commandBuffers = vkAllocateCommandBuffers(self.__device, allocInfo)
        self.__commandBuffers = [ffi.addressof(commandBuffers, i)[0] for i in range(len(self.__swapChainFramebuffers))]

    def __recordCommandBuffer(self, commandBuffer, imageIndex):
        beginInfo = VkCommandBufferBeginInfo(
            sType=VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO,
            flags=VK_COMMAND_BUFFER_USAGE_SIMULTANEOUS_USE_BIT
        )

        vkBeginCommandBuffer(commandBuffer, beginInfo)

        clearColor = VkClearValue([[0.0, 0.0, 0.0, 1.0]])
        renderPassInfo = VkRenderPassBeginInfo(
            sType=VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO,
            renderPass=self.__renderPass,
            framebuffer=self.__swapChainFramebuffers[imageIndex],
            renderArea=[[0, 0], self.__swapChainExtent],
            clearValueCount=1,
            pClearValues=ffi.addressof(clearColor)
        )

        vkCmdBeginRenderPass(commandBuffer, renderPassInfo, VK_SUBPASS_CONTENTS_INLINE)
        vkCmdBindPipeline(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, self.__graphicsPipeline)
        vkCmdDraw(commandBuffer, 3, 1, 0, 0)
        vkCmdEndRenderPass(commandBuffer)
        vkEndCommandBuffer(commandBuffer)

    def __createSemaphores(self):
        semaphoreInfo = VkSemaphoreCreateInfo(sType=VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO)

        for i in range(self.__maxFramesInFlight):
            self.__imageAvailableSemaphores.append(vkCreateSemaphore(self.__device, semaphoreInfo, None))
            self.__renderFinishedSemaphores.append(vkCreateSemaphore(self.__device, semaphoreInfo, None))

            fenceInfo = VkFenceCreateInfo(
                sType=VK_STRUCTURE_TYPE_FENCE_CREATE_INFO,
                flags=VK_FENCE_CREATE_SIGNALED_BIT
            )

            self.__inFlightFences.append(vkCreateFence(self.__device, fenceInfo, None))

    def __findMemoryType(self, typeFilter, properties):
        memProperties = vkGetPhysicalDeviceMemoryProperties(self.__physicalDevice)
        for i, memoryType in enumerate(memProperties.memoryTypes):
            if typeFilter & (1 << i) and (memoryType.propertyFlags & properties) == properties:
                return i
        raise Exception("failed to find suitable memory type!")

    def __createTextureImage(self, videoFrame):
        bufferInfo = VkBufferCreateInfo(
            sType=VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO,
            size=1920*1080*4,
            usage=VK_BUFFER_USAGE_TRANSFER_SRC_BIT,
            sharingMode=VK_SHARING_MODE_EXCLUSIVE,
        )

        indices = self.__findQueueFamilies(self.__physicalDevice)
        if indices.graphicsFamily != indices.presentFamily:
            bufferInfo.sharingMode = VK_SHARING_MODE_CONCURRENT
            bufferInfo.queueFamilyIndexCount = 2
            bufferInfo.pQueueFamilyIndices = [indices.graphicsFamily, indices.presentFamily]

        stagingBuffer = vkCreateBuffer(self.__device, bufferInfo, None)
        memReqs = vkGetBufferMemoryRequirements(self.__device, stagingBuffer)
        memAlloc = VkMemoryAllocateInfo(
            sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
            allocationSize = memReqs.size,
            memoryTypeIndex = self.__device.getMemoryType(memReqs.memoryTypeBits, VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT)
        )
        stagingMemory = vkAllocateMemory(self.__device, memAlloc, None)
        vkBindBufferMemory(self.__device, stagingBuffer, stagingMemory, 0)
        data = vkMapMemory(self.__device, stagingMemory, 0, memAlloc.allocationSize, 0)

        # Create a ctypes array that points to the mapped memory
        mappedArray = (ctypes.c_ubyte * memAlloc.allocationSize).from_address(data)

        # Copy the image data to the mapped memory
        ctypes.memmove(mappedArray, videoFrame, len(videoFrame))

        # Unmap the memory when done
        vkUnmapMemory(self.__device, stagingMemory)

        self.__createImage(1920, 1080, VK_FORMAT_R8G8B8A8_UNORM, VK_IMAGE_TILING_OPTIMAL,
                           VK_IMAGE_USAGE_TRANSFER_DST_BIT | VK_IMAGE_USAGE_SAMPLED_BIT, VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT)

        self.__transitionImageLayout(self.__textureImage, VK_FORMAT_R8G8B8A8_UNORM, VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL)
        self.__copyBufferToImage(stagingBuffer, self.__textureImage, 1920, 1080)

        vkDestroyBuffer(self.__device, stagingBuffer, None)
        vkFreeMemory(self.__device, stagingMemory, None)

    def __createImage(self, width, height, format, tiling, usage, properties):
        image = VkImageCreateInfo(
            sType=VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO,
            imageType=VK_IMAGE_TYPE_2D,
            extent=VkExtent3D(width, height, 1),
            mipLevels=1,
            arrayLayers=1,
            format=format,
            tiling=tiling,
            initialLayout=VK_IMAGE_LAYOUT_UNDEFINED,
            usage=usage,
            samples=VK_SAMPLE_COUNT_1_BIT,
            sharingMode=VK_SHARING_MODE_EXCLUSIVE
        )

        self.__textureImage = vkCreateImage(self.__device, image, None)

        memReqs = vkGetImageMemoryRequirements(self.__device, image)

        allocInfo = VkMemoryAllocateInfo(
            sType=VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
            allocationSize=memReqs.size,
            memoryTypeIndex=self.__findMemoryType(memReqs.memoryTypeBits, properties)
        )

        self.__textureImageMemory = vkAllocateMemory(self.__device, allocInfo, None)
        vkBindImageMemory(self.__device, self.__textureImage, self.__textureImageMemory, 0)

    def __beginSingleTimeCommands(self):
        commandBufferAllocateInfo = VkCommandBufferAllocateInfo(
            sType=VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO,
            level=VK_COMMAND_BUFFER_LEVEL_PRIMARY,
            commandPool=self.__commandPool,
            commandBufferCount=1
        )

        commandBuffer = vkAllocateCommandBuffers(self.__device, commandBufferAllocateInfo)[0]

        beginInfo = VkCommandBufferBeginInfo(
            sType=VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO,
            flags=VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT
        )

        vkBeginCommandBuffer(commandBuffer, beginInfo)

        return commandBuffer

    def __endSingleTimeCommands(self, commandBuffer):
        vkEndCommandBuffer(commandBuffer)

        submitInfo = VkSubmitInfo(
            sType=VK_STRUCTURE_TYPE_SUBMIT_INFO,
            commandBufferCount=1,
            pCommandBuffers=commandBuffer
        )

        vkQueueSubmit(self.__graphicsQueue, 1, submitInfo, VK_NULL_HANDLE)
        vkQueueWaitIdle(self.__graphicsQueue)

        vkFreeCommandBuffers(self.__device, self.__commandPool, 1, commandBuffer)

    def __copyBuffer(self, srcBuffer, dstBuffer, size):
        commandBuffer = self.__beginSingleTimeCommands()

        copyRegion = VkBufferCopy(size=size)
        vkCmdCopyBuffer(commandBuffer, srcBuffer, dstBuffer, 1, copyRegion)

        self.__endSingleTimeCommands(commandBuffer)

    def __transitionImageLayout(self, image, format, oldLayout, newLayout):
        commandBuffer = self.__beginSingleTimeCommands()

        subresourceRange = VkImageSubresourceRange(
            aspectMask=VK_IMAGE_ASPECT_COLOR_BIT,
            baseMipLevel=0,
            levelCount=1,
            baseArrayLayer=0,
            layerCount=1
        )

        if newLayout == VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL:
            subresourceRange.aspectMask = VK_IMAGE_ASPECT_DEPTH_BIT
            if self.__hasStencilComponent(format):
                subresourceRange.aspectMask |= VK_IMAGE_ASPECT_STENCIL_BIT

        barrier = VkImageMemoryBarrier(
            oldLayout=oldLayout,
            newLayout=newLayout,
            srcQueueFamilyIndex=VK_QUEUE_FAMILY_IGNORED,
            dstQueueFamilyIndex=VK_QUEUE_FAMILY_IGNORED,
            image=image,
            subresourceRange=subresourceRange
        )

        srcStage = 0
        dstStage = 0

        if oldLayout == VK_IMAGE_LAYOUT_UNDEFINED and newLayout == VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL:
            barrier.srcAccessMask = 0
            barrier.dstAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT

            srcStage = VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT
            dstStage = VK_PIPELINE_STAGE_TRANSFER_BIT
        elif oldLayout == VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL and newLayout == VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL:
            barrier.srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT
            barrier.dstAccessMask = VK_ACCESS_SHADER_READ_BIT

            srcStage = VK_PIPELINE_STAGE_TRANSFER_BIT
            dstStage = VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT
        elif oldLayout == VK_IMAGE_LAYOUT_UNDEFINED and newLayout == VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL:
            barrier.srcAccessMask = 0
            barrier.dstAccessMask = VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_READ_BIT | VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT

            srcStage = VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT
            dstStage = VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT
        else:
            raise Exception("unsupported layout transition!")

        vkCmdPipelineBarrier(commandBuffer, srcStage, dstStage, 0, 0, None, 0, None, 1, barrier)

        self.__endSingleTimeCommands(commandBuffer)

    def __copyBufferToImage(self, buffer, image, width, height):
        commandBuffer = self.__beginSingleTimeCommands()

        region = VkBufferImageCopy(
            bufferOffset=0,
            bufferRowLength=0,
            bufferImageHeight=0,
            imageSubresource=VkImageSubresourceLayers(
                aspectMask=VK_IMAGE_ASPECT_COLOR_BIT,
                mipLevel=0,
                baseArrayLayer=0,
                layerCount=1
            ),
            imageOffset=VkOffset3D(0, 0, 0),
            imageExtent=VkExtent3D(width, height, 1)
        )

        vkCmdCopyBufferToImage(commandBuffer, buffer, image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1, region)

        self.__endSingleTimeCommands(commandBuffer)

    def __createTextureImageView(self):
        self.__textureImageView = self.__createImageView(self.__textureImage, self.__swapChainImageFormat)

    def __createImageView(self, image, format):
        viewInfo = VkImageViewCreateInfo(
            sType=VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO,
            image=image,
            viewType=VK_IMAGE_VIEW_TYPE_2D,
            format=format,
            subresourceRange=VkImageSubresourceRange(
                aspectMask=VK_IMAGE_ASPECT_COLOR_BIT,
                baseMipLevel=0,
                levelCount=1,
                baseArrayLayer=0,
                layerCount=1
            ),
            components=VkComponentMapping(
                r=VK_COMPONENT_SWIZZLE_IDENTITY,
                g=VK_COMPONENT_SWIZZLE_IDENTITY,
                b=VK_COMPONENT_SWIZZLE_IDENTITY,
                a=VK_COMPONENT_SWIZZLE_IDENTITY
            )
        )

        return vkCreateImageView(self.__device, viewInfo, None)

    def __createTextureSampler(self):
        samplerInfo = VkSamplerCreateInfo(
            sType=VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO,
            magFilter=VK_FILTER_LINEAR,
            minFilter=VK_FILTER_LINEAR,
            addressModeU=VK_SAMPLER_ADDRESS_MODE_REPEAT,
            addressModeV=VK_SAMPLER_ADDRESS_MODE_REPEAT,
            addressModeW=VK_SAMPLER_ADDRESS_MODE_REPEAT,
            anisotropyEnable=True,
            maxAnisotropy=1,
            borderColor=VK_BORDER_COLOR_INT_OPAQUE_BLACK,
            unnormalizedCoordinates=False,
            compareEnable=False,
            compareOp=VK_COMPARE_OP_ALWAYS,
            mipmapMode=VK_SAMPLER_MIPMAP_MODE_LINEAR,
            minLod=0,
            maxLod=0,
            mipLodBias=0
        )

        self.__textureSampler = vkCreateSampler(self.__device, samplerInfo, None)

    def __createVertexBuffer(self):
        pass

    def __createDescriptorPool(self):
        poolSize = VkDescriptorPoolSize(
            type=VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER,
            descriptorCount=self.__maxFramesInFlight
        )

        poolInfo = VkDescriptorPoolCreateInfo(
            sType=VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO,
            poolSizeCount=1,
            pPoolSizes=poolSize,
            maxSets=self.__maxFramesInFlight
        )

        self.__descriptorPool = vkCreateDescriptorPool(self.__device, poolInfo, None)

    def __createDescriptorSetLayout(self):
        samplerLayoutBinding = VkDescriptorSetLayoutBinding(
            binding=1,
            descriptorType=VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER,
            descriptorCount=1,
            stageFlags=VK_SHADER_STAGE_FRAGMENT_BIT
        )

        bindings = [samplerLayoutBinding,]
        layoutInfo = VkDescriptorSetLayoutCreateInfo(
            sType=VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO,
            bindingCount=len(bindings),
            pBindings=bindings
        )

        self.__descriptorSetLayout = vkCreateDescriptorSetLayout(self.__device, layoutInfo, None)

    def __createDescriptorSets(self):
        layouts = [self.__descriptorSetLayout,] * self.__maxFramesInFlight
        allocInfo = VkDescriptorSetAllocateInfo(
            sType=VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO,
            descriptorPool=self.__descriptorPool,
            descriptorSetCount=self.__maxFramesInFlight,
            pSetLayouts=layouts
        )

        self.__descriptorSets = vkAllocateDescriptorSets(self.__device, allocInfo)

        for i in range(self.__maxFramesInFlight):
            bufferInfo = VkDescriptorBufferInfo(
                buffer=self.__uniformBuffers[i],
                offset=0,
                range=ffi.sizeof(self.__uniformBuffers[i])
            )

            imageInfo = VkDescriptorImageInfo(
                imageLayout=VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL,
                imageView=self.__textureImageView,
                sampler=self.__textureSampler
            )

            descriptorWrites = [VkWriteDescriptorSet(
                sType=VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET,
                dstSet=self.__descriptorSets[i],
                dstBinding=0,
                dstArrayElement=0,
                descriptorType=VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER,
                descriptorCount=1,
                pBufferInfo=bufferInfo
            ), VkWriteDescriptorSet(
                sType=VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET,
                dstSet=self.__descriptorSets[i],
                dstBinding=1,
                dstArrayElement=0,
                descriptorType=VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER,
                descriptorCount=1,
                pImageInfo=imageInfo
            )]

            vkUpdateDescriptorSets(self.__device, len(descriptorWrites), descriptorWrites, 0, None)

    def __drawFrame(self):
        vkWaitForFences(self.__device, 1, [self.__inFlightFences[self.__currentFrame]], VK_TRUE, UINT64_MAX)
        vkResetFences(self.__device, 1, [self.__inFlightFences[self.__currentFrame]])
        vkAcquireNextImageKHR = vkGetDeviceProcAddr(self.__device, 'vkAcquireNextImageKHR')
        vkQueuePresentKHR = vkGetDeviceProcAddr(self.__device, 'vkQueuePresentKHR')

        imageIndex = vkAcquireNextImageKHR(self.__device, self.__swapChain, UINT64_MAX,
                                           self.__imageAvailableSemaphores[self.__currentFrame], VK_NULL_HANDLE)

        self.__recordCommandBuffer(self.__commandBuffers[self.__currentFrame], imageIndex)

        submitInfo = VkSubmitInfo(sType=VK_STRUCTURE_TYPE_SUBMIT_INFO)

        waitSemaphores = ffi.new('VkSemaphore[]', [self.__imageAvailableSemaphores[self.__currentFrame]])
        waitStages = ffi.new('uint32_t[]', [VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT, ])
        submitInfo.waitSemaphoreCount = 1
        submitInfo.pWaitSemaphores = waitSemaphores
        submitInfo.pWaitDstStageMask = waitStages

        cmdBuffers = ffi.new('VkCommandBuffer[]', [self.__commandBuffers[self.__currentFrame], ])
        submitInfo.commandBufferCount = 1
        submitInfo.pCommandBuffers = cmdBuffers

        signalSemaphores = ffi.new('VkSemaphore[]', [self.__renderFinishedSemaphores[self.__currentFrame]])
        submitInfo.signalSemaphoreCount = 1
        submitInfo.pSignalSemaphores = signalSemaphores

        vkQueueSubmit(self.__graphicsQueue, 1, submitInfo, self.__inFlightFences[self.__currentFrame])

        presentInfo = VkPresentInfoKHR(
            sType=VK_STRUCTURE_TYPE_PRESENT_INFO_KHR,
            waitSemaphoreCount=1,
            pWaitSemaphores=signalSemaphores,
            swapchainCount=1,
            pSwapchains=[self.__swapChain],
            pImageIndices=[imageIndex]
        )

        vkQueuePresentKHR(self.__presentQueue, presentInfo)

        self.__currentFrame = (self.__currentFrame + 1) % self.__maxFramesInFlight

    def __createShaderModule(self, shaderFile):
        with open(shaderFile, 'rb') as sf:
            code = sf.read()
            codeSize = len(code)

            createInfo = VkShaderModuleCreateInfo(
                sType=VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO,
                codeSize=codeSize,
                pCode=code
            )

            return vkCreateShaderModule(self.__device, createInfo, None)


    def __chooseSwapSurfaceFormat(self, availableFormats):
        if len(availableFormats) == 1 and availableFormats[0].format == VK_FORMAT_UNDEFINED:
            return VkSurfaceFormatKHR(VK_FORMAT_B8G8R8A8_UNORM, 0)

        for availableFormat in availableFormats:
            if availableFormat.format == VK_FORMAT_B8G8R8A8_SRGB and availableFormat.colorSpace == VK_COLOR_SPACE_SRGB_NONLINEAR_KHR:
                return availableFormat

        return availableFormats[0]

    def __chooseSwapPresentMode(self, availablePresentModes):
        for availablePresentMode in availablePresentModes:
            if availablePresentMode == VK_PRESENT_MODE_IMMEDIATE_KHR:
                return availablePresentMode

        return VK_PRESENT_MODE_FIFO_KHR

    def __chooseSwapExtent(self, capabilities):
        glfw_width, glfw_height = glfw.get_framebuffer_size(self.__window)
        width = max(capabilities.minImageExtent.width, min(capabilities.maxImageExtent.width, glfw_width))
        height = max(capabilities.minImageExtent.height, min(capabilities.maxImageExtent.height, glfw_height))
        return VkExtent2D(width, height)

    def __querySwapChainSupport(self, device):
        details = SwapChainSupportDetails()

        vkGetPhysicalDeviceSurfaceCapabilitiesKHR = vkGetInstanceProcAddr(self.__instance, 'vkGetPhysicalDeviceSurfaceCapabilitiesKHR')
        details.capabilities = vkGetPhysicalDeviceSurfaceCapabilitiesKHR(device, self.__surface)

        vkGetPhysicalDeviceSurfaceFormatsKHR = vkGetInstanceProcAddr(self.__instance, 'vkGetPhysicalDeviceSurfaceFormatsKHR')
        details.formats = vkGetPhysicalDeviceSurfaceFormatsKHR(device, self.__surface)

        vkGetPhysicalDeviceSurfacePresentModesKHR = vkGetInstanceProcAddr(self.__instance, 'vkGetPhysicalDeviceSurfacePresentModesKHR')
        details.presentModes = vkGetPhysicalDeviceSurfacePresentModesKHR(device, self.__surface)

        return details

    def __isDeviceSuitable(self, device):
        indices = self.__findQueueFamilies(device)
        extensionsSupported = self.__checkDeviceExtensionSupport(device)
        swapChainAdequate = False
        if extensionsSupported:
            swapChainSupport = self.__querySwapChainSupport(device)
            swapChainAdequate = (not swapChainSupport.formats is None) and (not swapChainSupport.presentModes is None)
        supportedFeatures = vkGetPhysicalDeviceFeatures(device)
        return indices.isComplete() and extensionsSupported and swapChainAdequate and supportedFeatures.samplerAnisotropy

    def __checkDeviceExtensionSupport(self, device):
        availableExtensions = vkEnumerateDeviceExtensionProperties(device, None)
        requiredExtensions = set(deviceExtensions)

        for extension in availableExtensions:
            if extension.extensionName in requiredExtensions:
                requiredExtensions.remove(extension.extensionName)

        return len(requiredExtensions) == 0

    def __findQueueFamilies(self, device):
        vkGetPhysicalDeviceSurfaceSupportKHR = vkGetInstanceProcAddr(self.__instance,
                                                                     'vkGetPhysicalDeviceSurfaceSupportKHR')
        indices = QueueFamilyIndices()

        queueFamilies = vkGetPhysicalDeviceQueueFamilyProperties(device)

        for i, queueFamily in enumerate(queueFamilies):
            if queueFamily.queueCount > 0 and queueFamily.queueFlags & VK_QUEUE_GRAPHICS_BIT:
                indices.graphicsFamily = i

            presentSupport = vkGetPhysicalDeviceSurfaceSupportKHR(device, i, self.__surface)

            if queueFamily.queueCount > 0 and presentSupport:
                indices.presentFamily = i

            if indices.isComplete():
                break

        return indices

    def __getRequiredExtensions(self):
        extensions = list(map(str, glfw.get_required_instance_extensions()))

        if enableValidationLayers:
            extensions.append(VK_EXT_DEBUG_REPORT_EXTENSION_NAME)

        return extensions

    def __checkValidationLayerSupport(self):
        availableLayers = vkEnumerateInstanceLayerProperties()
        for layerName in validationLayers:
            layerFound = False

            for layerProperties in availableLayers:
                if layerName == layerProperties.layerName:
                    layerFound = True
                    break
            if not layerFound:
                return False

        return True

    def run(self):
        self.__initWindow()
        self.__initVulkan()
        self.__mainLoop()

    def __updateTexture(self, videoFrame):
        # Create VkImage and VkImageView for the texture
        # Create VkDeviceMemory to store the texture data
        # Copy videoFrame data to VkDeviceMemory
        pass

    def __beginFrame(self):
        # Acquire an image from the swap chain
        # Submit a command buffer to signal that the image is ready for rendering
        pass

    def __recordCommands(self):
        # Record the commands for this frame
        # Set up the render pass
        # Bind the graphics pipeline
        # Bind the texture
        # Draw the vertices
        pass

    def __endFrame(self):
        # Submit the command buffer for execution
        # Present the image in the swap chain
        pass

    def renderFrame(self, videoFrame):
        self.__updateTexture(videoFrame)
        self.__beginFrame()
        self.__recordCommands()
        self.__endFrame()



if __name__ == '__main__':

    app = BreezyDesktopVulkanApp()

    app.run()

    del app
    glfw.terminate()