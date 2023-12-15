//
//  DXRatingPlugin.m
//  App
//
//  Created by Galvin Gao on 12/13/23.
//

#import <Capacitor/Capacitor.h>

CAP_PLUGIN(DXRatingPlugin, "DXRatingPlugin",
  CAP_PLUGIN_METHOD(userPreferenceDidChanged, CAPPluginReturnPromise);
)
